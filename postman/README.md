# Postman collection

Import `MaterialPBX.postman_collection.json`, set `baseUrl` to the verified HTTPS control-plane base, and set `adminToken` in a private local Postman environment. Do not save a real credential into the collection or export it with an environment.

The collection exercises discovery, resource mutation, runtime views, call history, recordings, backups, and the first federation invitation step. Pairing still requires two independently administered servers and explicit fingerprint comparison; the collection does not automate or bypass that decision.

The accelerated delivery pass did not execute this collection against a live PBX.
