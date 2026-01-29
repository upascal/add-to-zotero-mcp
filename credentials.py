



@mcp.tool()
def setup_zotero_step1_library_id(library_id: str) -> dict:
    """
    Step 1 of Zotero setup: Set your Zotero Library ID.
    
    Call this FIRST when setting up Zotero. After this succeeds, 
    call setup_zotero_step2_api_key to complete the connection.
    
    WHERE TO FIND IT:
    Go to https://www.zotero.org/settings/keys
    Look for "Your userID for use in API calls is: XXXXXX"
    That number is your Library ID.
    
    Args:
        library_id: Your Zotero user ID number (e.g., "1234567")
    
    Returns:
        dict confirming the ID was saved, with next step instructions
    """
    global _runtime_credentials
    
    _runtime_credentials["library_id"] = library_id
    
    return {
        "success": True,
        "library_id": library_id,
        "next_step": "Now call setup_zotero_step2_api_key with the user's API key"
    }


@mcp.tool()
def setup_zotero_step2_api_key(api_key: str) -> dict:
    """
    Step 2 of Zotero setup: Set your Zotero API key and connect.
    
    Call this AFTER setup_zotero_step1_library_id. This will validate the 
    credentials and establish the connection.
    
    On success, credentials are saved to .env for future sessions.
    
    WHERE TO GET IT:
    Go to https://www.zotero.org/settings/keys
    Click "Create new private key"
    Check "Allow library access" 
    Copy the key (shown only once!)
    
    IMPORTANT: Never echo the API key back - treat it as a secret.
    
    Args:
        api_key: Your Zotero API key (keep secret, never display)
    
    Returns:
        dict with connection status
    """
    global _zot, _runtime_credentials
    
    # Check if library_id was set first
    if not _runtime_credentials["library_id"]:
        return {
            "success": False,
            "error": "Library ID not set. Call setup_zotero_step1_library_id first."
        }
    
    # Store the API key
    _runtime_credentials["api_key"] = api_key
    
    # Reset client to force reconnection
    _zot = None
    
    # Validate by trying to connect
    try:
        client = get_zotero_client()
        # Try a simple API call to verify credentials work
        collections = client.collections(limit=1)
        
        # Success! Save to .env for persistence
        _save_credentials_to_env(
            _runtime_credentials["library_id"],
            api_key
        )
        
        return {
            "success": True,
            "message": "Connected to Zotero and saved credentials!",
            "library_id": _runtime_credentials["library_id"]
            # Note: api_key intentionally NOT included
        }
    except Exception as e:
        # Reset on failure
        _runtime_credentials["api_key"] = None
        _zot = None
        return {
            "success": False,
            "error": str(e),
            "suggestion": "Double-check your API key. The Library ID looks fine."
        }


def _save_credentials_to_env(library_id: str, api_key: str):
    """Save credentials to .env file for persistence."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    
    # Read existing content if file exists
    existing_lines = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            existing_lines = f.readlines()
    
    # Filter out old Zotero credentials
    new_lines = [
        line for line in existing_lines
        if not line.startswith("ZOTERO_API_KEY=") 
        and not line.startswith("ZOTERO_LIBRARY_ID=")
    ]
    
    # Add new credentials
    new_lines.append(f"ZOTERO_LIBRARY_ID={library_id}\n")
    new_lines.append(f"ZOTERO_API_KEY={api_key}\n")
    
    # Write back
    with open(env_path, "w") as f:
        f.writelines(new_lines)
