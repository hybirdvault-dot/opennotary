// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title NotaryRegistry
 * @notice On-chain notarization registry that anchors document hashes for commissioned notaries.
 * @dev Records only content hashes (`bytes32 docHash`), never document content, and settles a flat
 * $1.00 USDC fee split as 99 cents to the notary plus 1 cent to the protocol treasury. Each
 * notarial act is authorized by two EIP-712 typed-data signatures (the notary's attestation and the
 * signer's acknowledgment), both verified with ECDSA against per-account nonces for replay
 * protection. `notarize()` is protected against reentrancy and can be paused by an admin.
 */
contract NotaryRegistry is AccessControl, Pausable, ReentrancyGuard, EIP712, Nonces {
    using SafeERC20 for IERC20;

    /**
     * @dev A commissioned notary's on-chain registry entry.
     * @param commissionHash Opaque hash referencing the notary's commissioning credentials.
     * @param stateCode Packed state/jurisdiction code the notary is commissioned in.
     * @param commissionExpiry Unix timestamp after which the notary is no longer active.
     * @param active Whether the notary is currently in good standing.
     */
    struct Notary {
        bytes32 commissionHash;
        bytes32 stateCode;
        uint256 commissionExpiry;
        bool active;
    }

    /**
     * @dev A single recorded notarial act. Only the document hash is stored on-chain.
     * @param docHash Content hash of the notarized document.
     * @param notary Address of the commissioned notary who performed the act.
     * @param signer Address of the party who acknowledged the document.
     * @param ipfsCid Content identifier referencing the off-chain document/metadata.
     * @param docType Packed document type descriptor.
     * @param stateCode Packed state/jurisdiction code the act was performed in.
     * @param timestamp Unix timestamp attested to by both parties.
     * @param revoked Whether the act has been revoked by an admin.
     */
    struct NotarialAct {
        bytes32 docHash;
        address notary;
        address signer;
        bytes32 ipfsCid;
        bytes32 docType;
        bytes32 stateCode;
        uint256 timestamp;
        bool revoked;
    }

    /// @notice USDC token used to settle notarization fees.
    IERC20 public immutable usdc;

    /// @notice Address that receives the protocol's 1-cent share of each fee.
    address public immutable protocolTreasury;

    /// @notice Fee paid to the notary per act, in USDC (6 decimals): 99 cents.
    uint256 public constant NOTARY_FEE = 990_000;

    /// @notice Fee paid to the protocol treasury per act, in USDC (6 decimals): 1 cent.
    uint256 public constant PROTOCOL_FEE = 10_000;

    /// @dev EIP-712 typehash for the notary's attestation message.
    bytes32 public constant NOTARY_ATTESTATION_TYPEHASH = keccak256(
        "NotaryAttestation(bytes32 docHash,address signer,bytes32 ipfsCid,bytes32 docType,bytes32 stateCode,uint256 fee,uint256 timestamp,uint256 deadline,uint256 nonce)"
    );

    /// @dev EIP-712 typehash for the signer's acknowledgment message.
    bytes32 public constant SIGNER_ACKNOWLEDGMENT_TYPEHASH = keccak256(
        "SignerAcknowledgment(bytes32 docHash,address notary,bytes32 ipfsCid,bytes32 docType,bytes32 stateCode,uint256 fee,uint256 timestamp,uint256 deadline,uint256 nonce)"
    );

    /// @notice Registry of commissioned notaries keyed by address.
    mapping(address => Notary) public notaries;

    /// @dev Recorded notarial acts keyed by document hash.
    mapping(bytes32 => NotarialAct) private _acts;

    /// @notice Whether a notarial act exists for a given document hash.
    mapping(bytes32 => bool) public actExists;

    /// @dev Document hashes recorded by each notary, in insertion order.
    mapping(address => bytes32[]) private _actsByNotary;

    /// @notice Emitted when a notary is registered.
    event NotaryRegistered(
        address indexed notary, bytes32 commissionHash, bytes32 stateCode, uint256 commissionExpiry
    );

    /// @notice Emitted when a notary is revoked.
    event NotaryRevoked(address indexed notary);

    /// @notice Emitted when a notarial act is recorded.
    event NotarialActRecorded(
        bytes32 indexed docHash,
        address indexed notary,
        address indexed signer,
        bytes32 ipfsCid,
        bytes32 docType,
        bytes32 stateCode,
        uint256 timestamp
    );

    /// @notice Emitted when a notarial act is revoked.
    event ActRevoked(bytes32 indexed docHash);

    /// @notice A zero address was provided where a non-zero address is required.
    error ZeroAddress();

    /// @notice The commission expiry is not in the future.
    error InvalidExpiry();

    /// @notice The notary is already registered and active.
    error NotaryAlreadyRegistered();

    /// @notice The notary has never been registered.
    error NotaryNotFound();

    /// @notice The notary is not currently active.
    error NotaryNotActive();

    /// @notice A notarial act already exists for the given document hash.
    error ActAlreadyRecorded();

    /// @notice No notarial act exists for the given document hash.
    error ActNotFound();

    /// @notice The provided notary signature is invalid.
    error InvalidNotarySignature();

    /// @notice The provided signer signature is invalid.
    error InvalidSignerSignature();

    /// @notice The attested timestamp is zero, in the future, or stale (more than one hour old).
    error InvalidTimestamp();

    /// @notice The signature deadline has passed.
    error DeadlineExceeded();

    /// @notice The notary and the signer are the same address.
    error SameParty();

    /// @notice The act's state code does not match the notary's commissioned state code.
    error JurisdictionMismatch();

    /// @notice The supplied fee does not equal the exact required notarization fee.
    error FeeMismatch();

    /**
     * @notice Deploys the registry and grants admin rights.
     * @param _usdc USDC token used for fee settlement.
     * @param _protocolTreasury Address receiving the protocol fee share.
     * @param _admin Address granted `DEFAULT_ADMIN_ROLE`.
     */
    constructor(IERC20 _usdc, address _protocolTreasury, address _admin) EIP712("OpenNotary", "1") {
        if (address(_usdc) == address(0) || _protocolTreasury == address(0) || _admin == address(0)) {
            revert ZeroAddress();
        }

        usdc = _usdc;
        protocolTreasury = _protocolTreasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /**
     * @notice Registers a new commissioned notary.
     * @dev Callable only by an admin. The commission expiry must be in the future. `NotaryAlreadyRegistered`
     * is raised only while an existing entry is still active and its commission has not yet expired; an
     * expired-but-active entry may be re-registered, which overwrites the stored record and reactivates
     * the notary.
     * @param notary Address of the notary to register.
     * @param commissionHash Hash referencing the notary's commissioning credentials.
     * @param stateCode Packed state/jurisdiction code.
     * @param commissionExpiry Unix timestamp after which the notary becomes inactive.
     */
    function registerNotary(
        address notary,
        bytes32 commissionHash,
        bytes32 stateCode,
        uint256 commissionExpiry
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (notaries[notary].active && block.timestamp <= notaries[notary].commissionExpiry) {
            revert NotaryAlreadyRegistered();
        }
        if (notary == address(0)) revert ZeroAddress();
        if (commissionExpiry <= block.timestamp) revert InvalidExpiry();

        notaries[notary] = Notary({
            commissionHash: commissionHash,
            stateCode: stateCode,
            commissionExpiry: commissionExpiry,
            active: true
        });

        emit NotaryRegistered(notary, commissionHash, stateCode, commissionExpiry);
    }

    /**
     * @notice Revokes an existing notary, marking them inactive.
     * @dev Callable only by an admin. A notary is considered present in the registry while `active`
     * is true, mirroring `registerNotary`'s membership check; a never-registered (or already
     * revoked) notary is therefore reported via `NotaryNotFound`.
     * @param notary Address of the notary to revoke.
     */
    function revokeNotary(address notary) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!notaries[notary].active) revert NotaryNotFound();

        notaries[notary].active = false;

        emit NotaryRevoked(notary);
    }

    /**
     * @notice Records a notarial act after verifying both parties' EIP-712 signatures and settling fees.
     * @dev The `notary` address is an explicit parameter so per-account nonces resolve EIP-2612-style:
     * the recovered signer of each digest must equal its declared address. Both signatures are verified
     * with ECDSA (never `msg.sender`), each account's nonce is consumed to prevent replay, and the $1.00
     * USDC fee is split as 99 cents to the notary and 1 cent to the protocol treasury. Each digest binds
     * the fee, timestamp and deadline alongside the payload fields: the declared fee must equal the exact
     * split total, the call must arrive before the deadline, the attested timestamp must fall within one
     * hour of `block.timestamp`, the act's `stateCode` must match the notary's commission, and the two
     * parties must be distinct. The fee is committed to by both signatures but not stored in the act.
     * @param docHash Content hash of the notarized document.
     * @param notary Address of the commissioned notary performing the act.
     * @param signer Address of the acknowledging party paying the fee.
     * @param ipfsCid Content identifier referencing off-chain document/metadata.
     * @param docType Packed document type descriptor.
     * @param stateCode Packed state/jurisdiction code.
     * @param fee Exact notarization fee both parties commit to, in USDC (6 decimals).
     * @param timestamp Unix timestamp attested to by both parties.
     * @param deadline Unix timestamp after which the signed messages are no longer accepted.
     * @param notarySig EIP-712 signature of the notary's attestation.
     * @param signerSig EIP-712 signature of the signer's acknowledgment.
     */
    function notarize(
        bytes32 docHash,
        address notary,
        address signer,
        bytes32 ipfsCid,
        bytes32 docType,
        bytes32 stateCode,
        uint256 fee,
        uint256 timestamp,
        uint256 deadline,
        bytes calldata notarySig,
        bytes calldata signerSig
    ) external nonReentrant whenNotPaused {
        if (actExists[docHash]) revert ActAlreadyRecorded();
        if (signer == address(0) || notary == address(0)) revert ZeroAddress();
        if (fee != NOTARY_FEE + PROTOCOL_FEE) revert FeeMismatch();
        if (block.timestamp > deadline) revert DeadlineExceeded();
        if (timestamp == 0 || timestamp > block.timestamp || timestamp + 1 hours < block.timestamp) {
            revert InvalidTimestamp();
        }
        if (notary == signer) revert SameParty();
        if (!isNotaryActive(notary)) revert NotaryNotActive();
        if (stateCode != notaries[notary].stateCode) revert JurisdictionMismatch();

        bytes32 notaryDigest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    NOTARY_ATTESTATION_TYPEHASH,
                    docHash,
                    signer,
                    ipfsCid,
                    docType,
                    stateCode,
                    fee,
                    timestamp,
                    deadline,
                    nonces(notary)
                )
            )
        );
        if (ECDSA.recover(notaryDigest, notarySig) != notary) revert InvalidNotarySignature();

        bytes32 signerDigest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    SIGNER_ACKNOWLEDGMENT_TYPEHASH,
                    docHash,
                    notary,
                    ipfsCid,
                    docType,
                    stateCode,
                    fee,
                    timestamp,
                    deadline,
                    nonces(signer)
                )
            )
        );
        if (ECDSA.recover(signerDigest, signerSig) != signer) revert InvalidSignerSignature();

        _useNonce(notary);
        _useNonce(signer);

        usdc.safeTransferFrom(signer, notary, NOTARY_FEE);
        usdc.safeTransferFrom(signer, protocolTreasury, PROTOCOL_FEE);

        _acts[docHash] = NotarialAct({
            docHash: docHash,
            notary: notary,
            signer: signer,
            ipfsCid: ipfsCid,
            docType: docType,
            stateCode: stateCode,
            timestamp: timestamp,
            revoked: false
        });
        actExists[docHash] = true;
        _actsByNotary[notary].push(docHash);

        emit NotarialActRecorded(docHash, notary, signer, ipfsCid, docType, stateCode, timestamp);
    }

    /**
     * @notice Revokes a previously recorded notarial act.
     * @dev Callable only by an admin. The act must already exist.
     * @param docHash Content hash identifying the act to revoke.
     */
    function revokeAct(bytes32 docHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!actExists[docHash]) revert ActNotFound();

        _acts[docHash].revoked = true;

        emit ActRevoked(docHash);
    }

    /**
     * @notice Pauses all notarization activity.
     * @dev Callable only by an admin.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Resumes notarization activity.
     * @dev Callable only by an admin.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Returns a recorded notarial act.
     * @param docHash Content hash identifying the act.
     * @return The stored notarial act.
     */
    function getAct(bytes32 docHash) external view returns (NotarialAct memory) {
        if (!actExists[docHash]) revert ActNotFound();

        return _acts[docHash];
    }

    /**
     * @notice Returns all document hashes recorded by a notary.
     * @param notary Address of the notary.
     * @return The list of document hashes recorded by the notary.
     */
    function getActsByNotary(address notary) external view returns (bytes32[] memory) {
        return _actsByNotary[notary];
    }

    /**
     * @notice Returns whether a notary is currently active and commissioned.
     * @param notary Address of the notary.
     * @return True if the notary is active and their commission has not expired.
     */
    function isNotaryActive(address notary) public view returns (bool) {
        return notaries[notary].active && notaries[notary].commissionExpiry >= block.timestamp;
    }

    /**
     * @notice Returns a notary's registry entry.
     * @param notary Address of the notary.
     * @return The stored notary entry.
     */
    function getNotary(address notary) external view returns (Notary memory) {
        return notaries[notary];
    }
}
