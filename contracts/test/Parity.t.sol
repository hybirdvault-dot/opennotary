// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title ParityTest
/// @notice BATCH 6 cross-language parity: consumes the fixture written by
///         `scripts/generate-test-sig.ts` (a schema-v2.0 `NotaryAttestation`
///         signed with viem's `signTypedData` over the "OpenNotary"/"1" domain)
///         and proves the viem signature recovers to the fixture signer when
///         verified in Solidity with `ECDSA.recover`.
/// @dev The fixture lives at `<repo>/test/fixtures/parity-sig.json` and carries
///      {digest, signature, signer, message, domain}. The digest is recomputed
///      from `message` + `domain` exactly the way `NotaryRegistry.notarize`
///      builds it (`_hashTypedDataV4(keccak256(abi.encode(...)))`), so a drift
///      in EITHER the EIP-712 struct layout or the signature itself fails this
///      test.
contract ParityTest is Test {
    using stdJson for string;

    /// @dev BATCH 1 SCHEMA SPEC v2.0 — must byte-match `NotaryRegistry`.
    bytes32 internal constant NOTARY_ATTESTATION_TYPEHASH = keccak256(
        "NotaryAttestation(bytes32 docHash,address signer,bytes32 ipfsCid,bytes32 docType,bytes32 stateCode,uint256 fee,uint256 timestamp,uint256 deadline,uint256 nonce)"
    );

    /// @dev Standard EIP-712 domain typehash used by OZ `EIP712("OpenNotary", "1")`.
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @notice Recovers the viem signer from the fixture and asserts Solidity agreement.
    function test_Parity_ViemSignatureRecoversInSolidity() public view {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../test/fixtures/parity-sig.json"));

        bytes32 digest = json.readBytes32(".digest");
        bytes memory signature = json.readBytes(".signature");
        address signer = json.readAddress(".signer");

        // Domain the viem signature was produced over.
        string memory domainName = json.readString(".domain.name");
        string memory domainVersion = json.readString(".domain.version");
        uint256 chainId = json.readUint(".domain.chainId");
        address verifyingContract = json.readAddress(".domain.verifyingContract");

        // v2.0 attestation message fields.
        bytes32 docHash = json.readBytes32(".message.docHash");
        address messageSigner = json.readAddress(".message.signer");
        bytes32 ipfsCid = json.readBytes32(".message.ipfsCid");
        bytes32 docType = json.readBytes32(".message.docType");
        bytes32 stateCode = json.readBytes32(".message.stateCode");
        uint256 fee = json.readUint(".message.fee");
        uint256 timestamp = json.readUint(".message.timestamp");
        uint256 deadline = json.readUint(".message.deadline");
        uint256 nonce = json.readUint(".message.nonce");

        assertEq(domainName, "OpenNotary", "fixture domain name");
        assertEq(domainVersion, "1", "fixture domain version");
        assertEq(messageSigner, signer, "fixture message.signer must equal fixture signer");

        // Recompute the EIP-712 digest exactly like `NotaryRegistry.notarize`.
        bytes32 structHash = keccak256(
            abi.encode(
                NOTARY_ATTESTATION_TYPEHASH, docHash, messageSigner, ipfsCid, docType, stateCode, fee, timestamp, deadline, nonce
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes(domainName)), keccak256(bytes(domainVersion)), chainId, verifyingContract)
        );
        bytes32 expectedDigest = keccak256(abi.encodePacked(hex"1901", domainSeparator, structHash));
        assertEq(expectedDigest, digest, "fixture digest must equal the Solidity-computed v2.0 EIP-712 digest");

        // THE parity assertion: the viem signature recovers to the viem signer.
        address recovered = ECDSA.recover(digest, signature);
        assertEq(recovered, signer, "viem signTypedData signature must recover to the fixture signer in Solidity");
    }
}
