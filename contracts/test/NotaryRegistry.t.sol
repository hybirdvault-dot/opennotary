// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {NotaryRegistry} from "../src/NotaryRegistry.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @title NotaryRegistryTest
/// @notice Test harness for NotaryRegistry targeting BATCH 1 SCHEMA SPEC v2.0 exactly.
/// @dev All authorizations are real EIP-712 signatures produced with `vm.sign` over the
///      "OpenNotary"/"1" domain separator (name, version, chainId, verifyingContract),
///      digest layout "\x19\x01" || domainSeparator || structHash, packed as (r, s, v).
///      Both v2.0 typehashes bind `fee` and `deadline`; the `notary`/`signer` arguments of
///      `notarize` are sig-verified declared addresses, never msg.sender.
contract NotaryRegistryTest is Test {
    // =====================================================================
    // EIP-712 typehashes (BATCH 1 SCHEMA SPEC v2.0)
    // =====================================================================

    bytes32 internal constant SIGNER_ACKNOWLEDGMENT_TYPEHASH =
        keccak256("SignerAcknowledgment(bytes32 docHash,address notary,bytes32 ipfsCid,bytes32 docType,bytes32 stateCode,uint256 fee,uint256 timestamp,uint256 deadline,uint256 nonce)");
    bytes32 internal constant NOTARY_ATTESTATION_TYPEHASH =
        keccak256("NotaryAttestation(bytes32 docHash,address signer,bytes32 ipfsCid,bytes32 docType,bytes32 stateCode,uint256 fee,uint256 timestamp,uint256 deadline,uint256 nonce)");
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    // =====================================================================
    // Fee constants (6 decimals)
    // =====================================================================

    uint256 internal constant NOTARY_FEE = 990_000;
    uint256 internal constant PROTOCOL_FEE = 10_000;
    uint256 internal constant TOTAL_FEE = 1_000_000; // $1.00 USDC = NOTARY_FEE + PROTOCOL_FEE

    // =====================================================================
    // Deterministic fixture values
    // =====================================================================

    uint256 internal constant START_TIME = 1_800_000_000;
    uint256 internal constant COMMISSION_EXPIRY = 2_000_000_000;

    bytes32 internal constant COMMISSION_HASH = keccak256("commission-certificate");
    bytes32 internal constant STATE_CODE = bytes32("CA");
    bytes32 internal constant IPFS_CID = keccak256("ipfs-cid");
    bytes32 internal constant DOC_TYPE = keccak256("DeedOfSale");

    uint256 internal constant NOTARY_PK = 0xA11CE;
    uint256 internal constant SIGNER_PK = 0xB0B;
    uint256 internal constant SECOND_NOTARY_PK = 0xD00D;
    uint256 internal constant WRONG_KEY_PK = 0xBAD;

    // =====================================================================
    // State
    // =====================================================================

    MockUSDC internal usdc;
    NotaryRegistry internal registry;

    address internal admin;
    address internal treasury;
    address internal stranger;
    address internal notary;
    address internal signer;

    /// @notice Canonical act payload consumed by the signing helpers and the notarize call.
    struct ActParams {
        bytes32 docHash;
        address notary;
        address signer;
        bytes32 ipfsCid;
        bytes32 docType;
        bytes32 stateCode;
        uint256 fee;
        uint256 timestamp;
        uint256 deadline;
    }

    // =====================================================================
    // Fixture
    // =====================================================================

    /// @notice Deploys the registry and mock USDC, funds the signer, and registers one active notary at a fixed time.
    function setUp() public {
        vm.warp(START_TIME);

        admin = makeAddr("admin");
        treasury = makeAddr("treasury");
        stranger = makeAddr("stranger");
        notary = vm.addr(NOTARY_PK);
        signer = vm.addr(SIGNER_PK);

        usdc = new MockUSDC();
        registry = new NotaryRegistry(usdc, treasury, admin);

        usdc.mint(signer, 100e6);
        vm.prank(signer);
        usdc.approve(address(registry), TOTAL_FEE);

        _registerNotary(notary, COMMISSION_HASH, STATE_CODE, COMMISSION_EXPIRY);
    }

    // =====================================================================
    // A-D: registerNotary
    // =====================================================================

    /// @notice registerNotary stores the notary record, marks it active, and emits NotaryRegistered.
    function test_RegisterNotary_StoresStateAndEmitsEvent() public {
        address newNotary = vm.addr(SECOND_NOTARY_PK);
        uint256 expiry = START_TIME + 30 days;

        vm.expectEmit(true, true, true, true, address(registry));
        emit NotaryRegistry.NotaryRegistered(newNotary, COMMISSION_HASH, STATE_CODE, expiry);
        _registerNotary(newNotary, COMMISSION_HASH, STATE_CODE, expiry);

        NotaryRegistry.Notary memory stored = registry.getNotary(newNotary);
        assertEq(stored.commissionHash, COMMISSION_HASH);
        assertEq(stored.stateCode, STATE_CODE);
        assertEq(stored.commissionExpiry, expiry);
        assertTrue(stored.active);
        assertTrue(registry.isNotaryActive(newNotary));
    }

    /// @notice registerNotary reverts with NotaryAlreadyRegistered for an active+unexpired entry, while an
    /// EXPIRED-but-active notary CAN be re-registered (the guard only covers active+unexpired entries).
    function test_RegisterNotary_RevertsWhenAlreadyRegistered() public {
        // Active + unexpired: re-registration is rejected.
        vm.expectRevert(NotaryRegistry.NotaryAlreadyRegistered.selector);
        _registerNotary(notary, COMMISSION_HASH, STATE_CODE, COMMISSION_EXPIRY);

        // Expired-but-active: the active flag is still set but the commission lapsed, so re-registration succeeds.
        address renewing = vm.addr(SECOND_NOTARY_PK);
        _registerNotary(renewing, COMMISSION_HASH, STATE_CODE, START_TIME + 1 days);
        assertTrue(registry.isNotaryActive(renewing));

        vm.warp(START_TIME + 2 days);
        assertFalse(registry.isNotaryActive(renewing));
        assertTrue(registry.getNotary(renewing).active); // expired, but the record is still flagged active

        bytes32 renewedCommission = keccak256("commission-renewed");
        bytes32 renewedState = bytes32("NY");
        uint256 renewedExpiry = block.timestamp + 30 days;
        vm.expectEmit(true, true, true, true, address(registry));
        emit NotaryRegistry.NotaryRegistered(renewing, renewedCommission, renewedState, renewedExpiry);
        _registerNotary(renewing, renewedCommission, renewedState, renewedExpiry);

        NotaryRegistry.Notary memory renewed = registry.getNotary(renewing);
        assertEq(renewed.commissionHash, renewedCommission);
        assertEq(renewed.stateCode, renewedState);
        assertEq(renewed.commissionExpiry, renewedExpiry);
        assertTrue(renewed.active);
        assertTrue(registry.isNotaryActive(renewing));
    }

    /// @notice registerNotary reverts with AccessControlUnauthorizedAccount when the caller is not an admin.
    function test_RegisterNotary_RevertsForNonAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                registry.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        registry.registerNotary(vm.addr(SECOND_NOTARY_PK), COMMISSION_HASH, STATE_CODE, COMMISSION_EXPIRY);
    }

    /// @notice registerNotary rejects a zero notary address (ZeroAddress) and a past commission expiry (InvalidExpiry);
    /// the constructor applies the same ZeroAddress guard to each of its three address arguments.
    function test_RegisterNotary_RevertsOnZeroAddressAndInvalidExpiry() public {
        vm.expectRevert(NotaryRegistry.ZeroAddress.selector);
        vm.prank(admin);
        registry.registerNotary(address(0), COMMISSION_HASH, STATE_CODE, COMMISSION_EXPIRY);

        vm.expectRevert(NotaryRegistry.InvalidExpiry.selector);
        vm.prank(admin);
        registry.registerNotary(vm.addr(SECOND_NOTARY_PK), COMMISSION_HASH, STATE_CODE, block.timestamp - 1);

        vm.expectRevert(NotaryRegistry.ZeroAddress.selector);
        new NotaryRegistry(MockUSDC(address(0)), treasury, admin);

        vm.expectRevert(NotaryRegistry.ZeroAddress.selector);
        new NotaryRegistry(usdc, address(0), admin);

        vm.expectRevert(NotaryRegistry.ZeroAddress.selector);
        new NotaryRegistry(usdc, treasury, address(0));
    }

    // =====================================================================
    // E-F: revokeNotary
    // =====================================================================

    /// @notice revokeNotary deactivates the notary, emits NotaryRevoked, and reverts NotaryNotFound for unknown accounts.
    function test_RevokeNotary_DeactivatesNotaryAndRejectsUnknown() public {
        vm.expectEmit(true, true, true, true, address(registry));
        emit NotaryRegistry.NotaryRevoked(notary);
        vm.prank(admin);
        registry.revokeNotary(notary);

        assertFalse(registry.isNotaryActive(notary));

        vm.expectRevert(NotaryRegistry.NotaryNotFound.selector);
        vm.prank(admin);
        registry.revokeNotary(stranger);
    }

    /// @notice revokeNotary reverts with AccessControlUnauthorizedAccount when the caller is not an admin.
    function test_RevokeNotary_RevertsForNonAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                registry.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        registry.revokeNotary(notary);
    }

    // =====================================================================
    // G-I: notarize happy path, fees, event
    // =====================================================================

    /// @notice notarize with valid EIP-712 signatures records the act; getAct returns every field and actExists is true.
    function test_Notarize_HappyPath_RecordsAct() public {
        ActParams memory p = _actParams(keccak256("deed-happy"), notary, signer);
        _notarizeWithSigs(NOTARY_PK, SIGNER_PK, p);

        NotaryRegistry.NotarialAct memory act = registry.getAct(p.docHash);
        assertEq(act.docHash, p.docHash);
        assertEq(act.notary, p.notary);
        assertEq(act.signer, p.signer);
        assertEq(act.ipfsCid, p.ipfsCid);
        assertEq(act.docType, p.docType);
        assertEq(act.stateCode, p.stateCode);
        assertEq(act.timestamp, p.timestamp);
        assertFalse(act.revoked);
        assertTrue(registry.actExists(p.docHash));
    }

    /// @notice notarize settles exactly 990_000 to the notary, 10_000 to the treasury, and 1_000_000 from the signer.
    function test_Notarize_SplitsFeesBetweenNotaryAndTreasury() public {
        ActParams memory p = _actParams(keccak256("deed-fees"), notary, signer);

        uint256 signerBefore = usdc.balanceOf(signer);
        uint256 notaryBefore = usdc.balanceOf(notary);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        _notarizeWithSigs(NOTARY_PK, SIGNER_PK, p);

        assertEq(usdc.balanceOf(signer), signerBefore - 1_000_000);
        assertEq(usdc.balanceOf(notary), notaryBefore + NOTARY_FEE);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + PROTOCOL_FEE);
        assertEq(usdc.balanceOf(address(registry)), 0);
    }

    /// @notice notarize emits NotarialActRecorded with the full act payload as event arguments.
    function test_Notarize_EmitsNotarialActRecorded() public {
        ActParams memory p = _actParams(keccak256("deed-event"), notary, signer);
        bytes memory notarySig = _signNotaryAttestation(NOTARY_PK, p, registry.nonces(p.notary));
        bytes memory signerSig = _signSignerAck(SIGNER_PK, p, registry.nonces(p.signer));

        vm.expectEmit(true, true, true, true, address(registry));
        emit NotaryRegistry.NotarialActRecorded(p.docHash, p.notary, p.signer, p.ipfsCid, p.docType, p.stateCode, p.timestamp);
        _callNotarize(p, notarySig, signerSig);
    }

    // =====================================================================
    // J-O: notarize revert paths (v2.0 check order: ActAlreadyRecorded -> ZeroAddress -> FeeMismatch ->
    //      DeadlineExceeded -> InvalidTimestamp -> SameParty -> JurisdictionMismatch -> NotaryNotActive ->
    //      notary sig -> signer sig)
    // =====================================================================

    /// @notice notarize reverts with ActAlreadyRecorded when the docHash is already recorded, even with fresh valid signatures.
    function test_Notarize_RevertsForDuplicateAct() public {
        ActParams memory p = _actParams(keccak256("deed-duplicate"), notary, signer);
        _notarizeWithSigs(NOTARY_PK, SIGNER_PK, p);

        // Fresh signatures over the current nonces so only the duplicate docHash can fail.
        bytes memory notarySig = _signNotaryAttestation(NOTARY_PK, p, registry.nonces(p.notary));
        bytes memory signerSig = _signSignerAck(SIGNER_PK, p, registry.nonces(p.signer));
        vm.expectRevert(NotaryRegistry.ActAlreadyRecorded.selector);
        _callNotarize(p, notarySig, signerSig);
    }

    /// @notice notarize reverts with NotaryNotActive both for a never-registered notary and for a notary whose
    /// commission has expired. The unregistered case declares stateCode bytes32(0) to match the empty record's
    /// stateCode, because JurisdictionMismatch is checked before NotaryNotActive in the v2.0 order.
    function test_Notarize_RevertsWhenNotaryUnregisteredOrExpired() public {
        address pending = vm.addr(SECOND_NOTARY_PK);

        // Never registered: signatures are valid and the act's stateCode matches the empty record (bytes32(0)),
        // so only the active-notary check can fail.
        ActParams memory unregistered = _actParams(keccak256("deed-unregistered"), pending, signer);
        unregistered.stateCode = bytes32(0);
        bytes memory notarySig1 = _signNotaryAttestation(SECOND_NOTARY_PK, unregistered, registry.nonces(unregistered.notary));
        bytes memory signerSig1 = _signSignerAck(SIGNER_PK, unregistered, registry.nonces(unregistered.signer));
        vm.expectRevert(NotaryRegistry.NotaryNotActive.selector);
        _callNotarize(unregistered, notarySig1, signerSig1);

        // Registered with a short commission (CA), then warped past its expiry; the act matches its stateCode.
        uint256 registrationTime = block.timestamp;
        _registerNotary(pending, COMMISSION_HASH, STATE_CODE, registrationTime + 1 days);
        assertTrue(registry.isNotaryActive(pending));
        vm.warp(registrationTime + 2 days);
        assertFalse(registry.isNotaryActive(pending));

        ActParams memory expired = _actParams(keccak256("deed-expired"), pending, signer);
        bytes memory notarySig2 = _signNotaryAttestation(SECOND_NOTARY_PK, expired, registry.nonces(expired.notary));
        bytes memory signerSig2 = _signSignerAck(SIGNER_PK, expired, registry.nonces(expired.signer));
        vm.expectRevert(NotaryRegistry.NotaryNotActive.selector);
        _callNotarize(expired, notarySig2, signerSig2);
    }

    /// @notice notarize reverts with InvalidNotarySignature when the attestation is signed by the wrong key.
    function test_Notarize_RevertsForWrongNotarySignature() public {
        ActParams memory p = _actParams(keccak256("deed-wrong-notary-sig"), notary, signer);
        // Attestation signed by the wrong key; acknowledgment is valid so only the notary check can fail.
        bytes memory notarySig = _signNotaryAttestation(WRONG_KEY_PK, p, registry.nonces(p.notary));
        bytes memory signerSig = _signSignerAck(SIGNER_PK, p, registry.nonces(p.signer));

        vm.expectRevert(NotaryRegistry.InvalidNotarySignature.selector);
        _callNotarize(p, notarySig, signerSig);
    }

    /// @notice notarize reverts with InvalidSignerSignature when the acknowledgment is signed by the wrong key.
    function test_Notarize_RevertsForWrongSignerSignature() public {
        ActParams memory p = _actParams(keccak256("deed-wrong-signer-sig"), notary, signer);
        // Attestation is valid so only the signer check can fail.
        bytes memory notarySig = _signNotaryAttestation(NOTARY_PK, p, registry.nonces(p.notary));
        bytes memory signerSig = _signSignerAck(WRONG_KEY_PK, p, registry.nonces(p.signer));

        vm.expectRevert(NotaryRegistry.InvalidSignerSignature.selector);
        _callNotarize(p, notarySig, signerSig);
    }

    /// @notice notarize reverts with InvalidTimestamp when the act timestamp is ahead of block.timestamp (the v2.0
    /// check order folds zero/future/stale timestamps into InvalidTimestamp), and with ZeroAddress when either
    /// declared party is the zero address (that guard runs before signature verification).
    function test_Notarize_RevertsForFutureTimestamp() public {
        ActParams memory p = _actParams(keccak256("deed-future"), notary, signer);
        p.timestamp = block.timestamp + 1;
        // Both signatures commit to the future timestamp and are valid, so only the time check can fail.
        bytes memory notarySig = _signNotaryAttestation(NOTARY_PK, p, registry.nonces(p.notary));
        bytes memory signerSig = _signSignerAck(SIGNER_PK, p, registry.nonces(p.signer));

        vm.expectRevert(NotaryRegistry.InvalidTimestamp.selector);
        _callNotarize(p, notarySig, signerSig);

        ActParams memory zeroSigner = _actParams(keccak256("deed-zero-signer"), notary, address(0));
        bytes memory zeroSignerNotarySig = _signNotaryAttestation(NOTARY_PK, zeroSigner, registry.nonces(zeroSigner.notary));
        bytes memory zeroSignerAck = _signSignerAck(SIGNER_PK, zeroSigner, registry.nonces(zeroSigner.signer));
        vm.expectRevert(NotaryRegistry.ZeroAddress.selector);
        _callNotarize(zeroSigner, zeroSignerNotarySig, zeroSignerAck);

        ActParams memory zeroNotary = _actParams(keccak256("deed-zero-notary"), address(0), signer);
        bytes memory zeroNotaryAttestation = _signNotaryAttestation(NOTARY_PK, zeroNotary, registry.nonces(zeroNotary.notary));
        bytes memory zeroNotaryAck = _signSignerAck(SIGNER_PK, zeroNotary, registry.nonces(zeroNotary.signer));
        vm.expectRevert(NotaryRegistry.ZeroAddress.selector);
        _callNotarize(zeroNotary, zeroNotaryAttestation, zeroNotaryAck);
    }

    // =====================================================================
    // J2: notarize revert paths added by BATCH 1 SCHEMA SPEC v2.0
    // =====================================================================

    /// @notice notarize reverts with SameParty when the declared notary and signer are the same account, even with
    /// valid dual signatures (both signed by that account's key over its current nonce).
    function test_RevertWhen_SameParty() public {
        // notary == signer; both signatures are valid over the shared account's nonce, everything else is valid.
        ActParams memory p = _actParams(keccak256("deed-same-party"), notary, notary);
        bytes memory notarySig = _signNotaryAttestation(NOTARY_PK, p, registry.nonces(p.notary));
        bytes memory signerSig = _signSignerAck(NOTARY_PK, p, registry.nonces(p.signer));

        vm.expectRevert(NotaryRegistry.SameParty.selector);
        _callNotarize(p, notarySig, signerSig);
    }

    /// @notice notarize reverts with JurisdictionMismatch when the act's stateCode differs from the notary's
    /// commissioned stateCode ("NY" act against a "CA" commission), even with valid dual signatures.
    function test_RevertWhen_JurisdictionMismatch() public {
        // The notary is commissioned in "CA" but the act declares "NY"; both signatures bind "NY".
        ActParams memory p = _actParams(keccak256("deed-jurisdiction"), notary, signer);
        p.stateCode = bytes32("NY");
        bytes memory notarySig = _signNotaryAttestation(NOTARY_PK, p, registry.nonces(p.notary));
        bytes memory signerSig = _signSignerAck(SIGNER_PK, p, registry.nonces(p.signer));

        vm.expectRevert(NotaryRegistry.JurisdictionMismatch.selector);
        _callNotarize(p, notarySig, signerSig);
    }

    /// @notice notarize reverts with InvalidTimestamp for timestamp == 0 and for a backdated timestamp beyond the
    /// one-hour tolerance (block.timestamp - 2 hours); both signatures bind the rejected timestamp.
    function test_RevertWhen_InvalidTimestampZeroOrBackdated() public {
        // timestamp == 0: everything else is valid and both signatures bind the zero timestamp.
        ActParams memory zeroTs = _actParams(keccak256("deed-ts-zero"), notary, signer);
        zeroTs.timestamp = 0;
        bytes memory zeroTsNotarySig = _signNotaryAttestation(NOTARY_PK, zeroTs, registry.nonces(zeroTs.notary));
        bytes memory zeroTsSignerSig = _signSignerAck(SIGNER_PK, zeroTs, registry.nonces(zeroTs.signer));
        vm.expectRevert(NotaryRegistry.InvalidTimestamp.selector);
        _callNotarize(zeroTs, zeroTsNotarySig, zeroTsSignerSig);

        // Backdated beyond the one-hour window: timestamp + 1 hours < block.timestamp.
        ActParams memory stale = _actParams(keccak256("deed-ts-stale"), notary, signer);
        stale.timestamp = block.timestamp - 2 hours;
        bytes memory staleNotarySig = _signNotaryAttestation(NOTARY_PK, stale, registry.nonces(stale.notary));
        bytes memory staleSignerSig = _signSignerAck(SIGNER_PK, stale, registry.nonces(stale.signer));
        vm.expectRevert(NotaryRegistry.InvalidTimestamp.selector);
        _callNotarize(stale, staleNotarySig, staleSignerSig);
    }

    /// @notice notarize reverts with DeadlineExceeded when block.timestamp is past the signed deadline; both
    /// signatures are valid over THAT deadline and everything else is valid.
    function test_RevertWhen_DeadlineExceeded() public {
        ActParams memory p = _actParams(keccak256("deed-deadline"), notary, signer);
        p.deadline = block.timestamp - 1; // already elapsed
        bytes memory notarySig = _signNotaryAttestation(NOTARY_PK, p, registry.nonces(p.notary));
        bytes memory signerSig = _signSignerAck(SIGNER_PK, p, registry.nonces(p.signer));

        vm.expectRevert(NotaryRegistry.DeadlineExceeded.selector);
        _callNotarize(p, notarySig, signerSig);
    }

    // =====================================================================
    // P: replay protection
    // =====================================================================

    /// @notice Replaying a used nonce reverts on signature checks, a correctly nonced follow-up act succeeds, and
    /// nonces increment per account.
    function test_Notarize_ReplayProtection_NoncesIncrementPerAccount() public {
        _approveUsdc(2 * TOTAL_FEE);

        ActParams memory first = _actParams(keccak256("deed-replay-1"), notary, signer);
        _notarizeWithSigs(NOTARY_PK, SIGNER_PK, first);
        assertEq(registry.nonces(notary), 1);
        assertEq(registry.nonces(signer), 1);

        ActParams memory second = _actParams(keccak256("deed-replay-2"), notary, signer);

        // Replayed notary nonce (0) with a valid signer acknowledgment: fails the notary check in any verification order.
        bytes memory staleNotarySig = _signNotaryAttestation(NOTARY_PK, second, 0);
        bytes memory freshSignerSig = _signSignerAck(SIGNER_PK, second, registry.nonces(second.signer));
        vm.expectRevert(NotaryRegistry.InvalidNotarySignature.selector);
        _callNotarize(second, staleNotarySig, freshSignerSig);

        // Replayed signer nonce (0) with a valid attestation: fails the signer check in any verification order.
        bytes memory freshNotarySig = _signNotaryAttestation(NOTARY_PK, second, registry.nonces(second.notary));
        bytes memory staleSignerSig = _signSignerAck(SIGNER_PK, second, 0);
        vm.expectRevert(NotaryRegistry.InvalidSignerSignature.selector);
        _callNotarize(second, freshNotarySig, staleSignerSig);

        // Correctly nonced second act succeeds, proving nonces advanced per account.
        _notarizeWithSigs(NOTARY_PK, SIGNER_PK, second);
        assertEq(registry.nonces(notary), 2);
        assertEq(registry.nonces(signer), 2);
        assertTrue(registry.actExists(second.docHash));
    }

    // =====================================================================
    // Q: pause / unpause
    // =====================================================================

    /// @notice pause() blocks notarize with the Pausable EnforcedPause revert and unpause() restores recording.
    function test_Pause_BlocksNotarizeAndUnpauseRestoresIt() public {
        ActParams memory blocked = _actParams(keccak256("deed-paused"), notary, signer);
        bytes memory notarySig = _signNotaryAttestation(NOTARY_PK, blocked, registry.nonces(blocked.notary));
        bytes memory signerSig = _signSignerAck(SIGNER_PK, blocked, registry.nonces(blocked.signer));

        vm.prank(admin);
        registry.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        _callNotarize(blocked, notarySig, signerSig);
        assertFalse(registry.actExists(blocked.docHash));

        vm.prank(admin);
        registry.unpause();

        ActParams memory p = _actParams(keccak256("deed-unpaused"), notary, signer);
        _notarizeWithSigs(NOTARY_PK, SIGNER_PK, p);
        assertTrue(registry.actExists(p.docHash));
    }

    // =====================================================================
    // R: revokeAct
    // =====================================================================

    /// @notice revokeAct sets the revoked flag and emits ActRevoked; reverts ActNotFound for unknown docs and
    /// AccessControl for non-admins.
    function test_RevokeAct_RevokesActAndRejectsUnknownOrNonAdmin() public {
        ActParams memory p = _actParams(keccak256("deed-revoke"), notary, signer);
        _notarizeWithSigs(NOTARY_PK, SIGNER_PK, p);

        vm.expectEmit(true, true, true, true, address(registry));
        emit NotaryRegistry.ActRevoked(p.docHash);
        vm.prank(admin);
        registry.revokeAct(p.docHash);

        NotaryRegistry.NotarialAct memory act = registry.getAct(p.docHash);
        assertTrue(act.revoked);

        vm.expectRevert(NotaryRegistry.ActNotFound.selector);
        vm.prank(admin);
        registry.revokeAct(keccak256("never-recorded"));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                registry.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        registry.revokeAct(p.docHash);
    }

    // =====================================================================
    // S: views
    // =====================================================================

    /// @notice getActsByNotary returns every docHash recorded by a notary in recording order and getNotary returns
    /// the stored record.
    function test_Views_GetActsByNotaryAndGetNotary() public {
        _approveUsdc(3 * TOTAL_FEE);

        address secondNotary = vm.addr(SECOND_NOTARY_PK);
        _registerNotary(secondNotary, keccak256("commission-two"), bytes32("NY"), COMMISSION_EXPIRY);

        ActParams memory a1 = _actParams(keccak256("deed-a1"), notary, signer);
        ActParams memory a2 = _actParams(keccak256("deed-a2"), notary, signer);
        ActParams memory a3 = _actParams(keccak256("deed-a3"), secondNotary, signer);
        a3.stateCode = bytes32("NY"); // match the second notary's commissioned state (JurisdictionMismatch guard)
        _notarizeWithSigs(NOTARY_PK, SIGNER_PK, a1);
        _notarizeWithSigs(NOTARY_PK, SIGNER_PK, a2);
        _notarizeWithSigs(SECOND_NOTARY_PK, SIGNER_PK, a3);

        bytes32[] memory acts = registry.getActsByNotary(notary);
        assertEq(acts.length, 2);
        assertEq(acts[0], a1.docHash);
        assertEq(acts[1], a2.docHash);

        bytes32[] memory secondActs = registry.getActsByNotary(secondNotary);
        assertEq(secondActs.length, 1);
        assertEq(secondActs[0], a3.docHash);

        NotaryRegistry.Notary memory stored = registry.getNotary(notary);
        assertEq(stored.commissionHash, COMMISSION_HASH);
        assertEq(stored.stateCode, STATE_CODE);
        assertEq(stored.commissionExpiry, COMMISSION_EXPIRY);
        assertTrue(stored.active);

        vm.expectRevert(NotaryRegistry.ActNotFound.selector);
        registry.getAct(keccak256("never-recorded"));
    }

    // =====================================================================
    // Helpers
    // =====================================================================

    /// @notice Builds an act payload with the shared fixture fields: fee 1_000_000, timestamp now, deadline now+1h.
    function _actParams(bytes32 docHash, address notary_, address signer_) internal view returns (ActParams memory) {
        return ActParams(docHash, notary_, signer_, IPFS_CID, DOC_TYPE, STATE_CODE, TOTAL_FEE, block.timestamp, block.timestamp + 1 hours);
    }

    /// @notice Registers a notary through the admin.
    function _registerNotary(address notary_, bytes32 commissionHash_, bytes32 stateCode_, uint256 commissionExpiry_) internal {
        vm.prank(admin);
        registry.registerNotary(notary_, commissionHash_, stateCode_, commissionExpiry_);
    }

    /// @notice Sets the signer's USDC allowance for the registry.
    function _approveUsdc(uint256 amount) internal {
        vm.prank(signer);
        usdc.approve(address(registry), amount);
    }

    /// @notice Computes the EIP-712 domain separator for the "OpenNotary"/"1" domain.
    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256("OpenNotary"),
            keccak256("1"),
            block.chainid,
            address(registry)
        ));
    }

    /// @notice Builds the NotaryAttestation digest for `p` at `nonce` (binds fee and deadline per v2.0).
    function _notaryAttestationDigest(ActParams memory p, uint256 nonce) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            NOTARY_ATTESTATION_TYPEHASH,
            p.docHash,
            p.signer,
            p.ipfsCid,
            p.docType,
            p.stateCode,
            p.fee,
            p.timestamp,
            p.deadline,
            nonce
        ));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    /// @notice Builds the SignerAcknowledgment digest for `p` at `nonce` (binds fee and deadline per v2.0).
    function _signerAckDigest(ActParams memory p, uint256 nonce) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            SIGNER_ACKNOWLEDGMENT_TYPEHASH,
            p.docHash,
            p.notary,
            p.ipfsCid,
            p.docType,
            p.stateCode,
            p.fee,
            p.timestamp,
            p.deadline,
            nonce
        ));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    /// @notice Signs the NotaryAttestation for `p` with `notaryPk` at `nonce`.
    function _signNotaryAttestation(uint256 notaryPk, ActParams memory p, uint256 nonce) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(notaryPk, _notaryAttestationDigest(p, nonce));
        return abi.encodePacked(r, s, v);
    }

    /// @notice Signs the SignerAcknowledgment for `p` with `signerPk` at `nonce`.
    function _signSignerAck(uint256 signerPk, ActParams memory p, uint256 nonce) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, _signerAckDigest(p, nonce));
        return abi.encodePacked(r, s, v);
    }

    /// @notice Calls notarize with `p`'s payload (fee, timestamp and deadline included) and the given signatures.
    function _callNotarize(ActParams memory p, bytes memory notarySig, bytes memory signerSig) internal {
        registry.notarize(
            p.docHash,
            p.notary,
            p.signer,
            p.ipfsCid,
            p.docType,
            p.stateCode,
            p.fee,
            p.timestamp,
            p.deadline,
            notarySig,
            signerSig
        );
    }

    /// @notice Notarizes `p` with fresh signatures over the current nonces of the notary and signer accounts.
    function _notarizeWithSigs(uint256 notaryPk, uint256 signerPk, ActParams memory p) internal {
        bytes memory notarySig = _signNotaryAttestation(notaryPk, p, registry.nonces(p.notary));
        bytes memory signerSig = _signSignerAck(signerPk, p, registry.nonces(p.signer));
        _callNotarize(p, notarySig, signerSig);
    }
}
