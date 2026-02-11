#!/usr/bin/env bash

set -euo pipefail  # Exit on error, undefined variables, and pipe failures

# Color codes for better output readability
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Configuration
readonly NOIR_VERSION="1.0.0-beta.6"
readonly BB_VERSION="0.84.0"
readonly CIRCUITS_DIR="circuits"
readonly TARGET_DIR="./target"

# Proof configuration
readonly PROOF_TYPE="ZK"  # Set to "Plain" for non-zk variant
readonly PROOF_FILE_PATH="${TARGET_DIR}/proof"
readonly VK_FILE_PATH="${TARGET_DIR}/vk"
readonly PUBS_FILE_PATH="${TARGET_DIR}/public_inputs"

# Output files
readonly ZKV_PROOF_HEX_FILE_PATH="${TARGET_DIR}/circuit_name_proof.hex"
readonly ZKV_VK_HEX_FILE_PATH="${TARGET_DIR}/circuit_name_vk.hex"
readonly ZKV_PUBS_HEX_FILE_PATH="${TARGET_DIR}/circuit_name_pubs.hex"

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}✅${NC} $*"
}

# Error handler
error_exit() {
    log_error "$1"
    exit "${2:-1}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Update Noir and Barretenberg versions
update_versions() {
    log_info "Updating Noir and Barretenberg versions..."

    if ! command_exists noirup; then
        error_exit "noirup command not found. Please install Noir toolchain first."
    fi

    if ! command_exists bbup; then
        error_exit "bbup command not found. Please install Barretenberg toolchain first."
    fi

    noirup --version "${NOIR_VERSION}" || error_exit "Failed to update Noir version"
    log_info "Noir version: $(nargo --version 2>/dev/null || echo 'Unable to get version')"

    bbup -v "${BB_VERSION}" || error_exit "Failed to update Barretenberg version"
    log_info "Barretenberg version: $(bb --version 2>/dev/null || echo 'Unable to get version')"
}

# Compile circuit
compile_circuit() {
    log_info "Compiling circuit..."
    nargo compile || error_exit "Circuit compilation failed"
    log_success "Circuit compiled successfully"
}

# Generate witness
generate_witness() {
    log_info "Generating witness..."
    nargo execute || error_exit "Witness generation failed"
    log_success "Witness generated successfully"
}

# Generate proof
generate_proof() {
    log_info "Generating proof..."

    bb prove \
        -s ultra_honk \
        -b "${TARGET_DIR}/circuit_name.json" \
        -w "${TARGET_DIR}/circuit_name.gz" \
        -o "${TARGET_DIR}" \
        --oracle_hash keccak \
        --zk || error_exit "Proof generation failed"

    log_success "Proof generated successfully"
}

# Generate verification key
generate_vk() {
    log_info "Generating verification key..."

    bb write_vk \
        -s ultra_honk \
        -b "${TARGET_DIR}/circuit_name.json" \
        -o "${TARGET_DIR}" \
        --oracle_hash keccak || error_exit "VK generation failed"

    log_success "Verification key generated successfully"
}

# Verify proof
verify_proof() {
    log_info "Verifying proof..."

    if [[ ! -f "${PROOF_FILE_PATH}" ]]; then
        log_warn "Proof file not found at '${PROOF_FILE_PATH}'. Skipping verification."
        return 1
    fi

    if [[ ! -f "${VK_FILE_PATH}" ]]; then
        log_warn "Verification key file not found at '${VK_FILE_PATH}'. Skipping verification."
        return 1
    fi

    bb verify -p "${PROOF_FILE_PATH}" -k "${VK_FILE_PATH}" || error_exit "Proof verification failed"

    log_success "Proof verified successfully"
}

# Verify proof
verify_proof() {
    log_info "Verifying proof..."

    if [[ ! -f "${PROOF_FILE_PATH}" ]]; then
        error_exit "Proof file not found at ${PROOF_FILE_PATH}"
    fi

    if [[ ! -f "${VK_FILE_PATH}" ]]; then
        error_exit "Verification key file not found at ${VK_FILE_PATH}"
    fi

    bb verify \
        -p "${PROOF_FILE_PATH}" \
        -k "${VK_FILE_PATH}" || error_exit "Proof verification failed"

    log_success "Proof verified successfully"
}

# Convert file to hexadecimal format
file_to_hex() {
    local file_path="$1"
    local output_path="$2"
    local format_type="${3:-default}"

    if [[ ! -f "${file_path}" ]]; then
        log_warn "File '${file_path}' not found. Skipping conversion."
        return 1
    fi

    case "${format_type}" in
        proof)
            local proof_bytes
            proof_bytes=$(xxd -p -c 256 "${file_path}" | tr -d '\n')
            printf '{\n    "%s": "0x%s"\n}\n' "${PROOF_TYPE}" "${proof_bytes}" > "${output_path}"
            ;;
        vk)
            printf '"0x%s"\n' "$(xxd -p -c 0 "${file_path}")" > "${output_path}"
            ;;
        pubs)
            xxd -p -c 32 "${file_path}" | \
                sed 's/.*/"0x&"/' | \
                paste -sd, - | \
                sed 's/.*/[&]/' > "${output_path}"
            ;;
        *)
            log_error "Unknown format type: ${format_type}"
            return 1
            ;;
    esac

    log_success "Hex file generated at ${output_path}"
    return 0
}

# Process artifacts
process_artifacts() {
    log_info "Processing artifacts..."

    # Convert proof to hexadecimal
    file_to_hex "${PROOF_FILE_PATH}" "${ZKV_PROOF_HEX_FILE_PATH}" "proof"

    # Convert verification key to hexadecimal
    file_to_hex "${VK_FILE_PATH}" "${ZKV_VK_HEX_FILE_PATH}" "vk"

    # Convert public inputs to hexadecimal
    file_to_hex "${PUBS_FILE_PATH}" "${ZKV_PUBS_HEX_FILE_PATH}" "pubs"

    log_success "All artifacts processed successfully"
}

# Main execution
main() {
    log_info "Starting Noir circuit processing pipeline..."

    update_versions

    # Change to circuits directory for all circuit operations
    if [[ ! -d "${CIRCUITS_DIR}" ]]; then
        error_exit "Circuits directory '${CIRCUITS_DIR}' not found"
    fi

    cd "${CIRCUITS_DIR}" || error_exit "Failed to change to circuits directory"
    log_info "Working in directory: $(pwd)"

    compile_circuit
    generate_witness
    generate_proof
    generate_vk
    verify_proof
    process_artifacts

    log_success "Pipeline completed successfully!"
}

# Run main function
main "$@"
