# Function to load environment variables from .env file
load_dotenv() {
    local env_file="${1:-.env}"

    if [ ! -f "$env_file" ]; then
        echo "[WARN] .env file not found at $env_file"
        return 1
    fi

    # Read the .env file line by line
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines and comments
        if [[ -z "$line" ]] || [[ "$line" =~ ^[[:space:]]*# ]]; then
            continue
        fi

        # Remove leading/trailing whitespace
        line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

        # Skip if still empty after trimming
        if [ -z "$line" ]; then
            continue
        fi

        # Check if line contains an equals sign
        if [[ "$line" =~ ^[^=]+= ]]; then
            # Extract key and value
            key="${line%%=*}"
            value="${line#*=}"

            # Remove leading/trailing whitespace from key
            key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

            # Remove leading/trailing whitespace and quotes from value
            value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

            # Remove surrounding quotes if present
            if [[ "$value" =~ ^\".*\"$ ]]; then
                value=$(echo "$value" | sed 's/^"\(.*\)"$/\1/')
            elif [[ "$value" =~ ^\'.*\'$ ]]; then
                value=$(echo "$value" | sed "s/^'\\(.*\\)'\$/\\1/")
            fi

            # Export the variable
            export "$key=$value"
        fi
    done < "$env_file"
}
