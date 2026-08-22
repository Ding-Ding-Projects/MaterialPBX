# Security policy

Please report security concerns privately through the repository's GitHub security-advisory feature. Do not include credentials, private phone numbers, call records, recordings, or live server addresses in an issue.

MaterialPBX separates its untrusted renderer from privileged desktop and server operations, validates typed requests at each boundary, keeps credentials out of renderer storage and exports, and labels disconnected or unverified state. Code signing is intentionally disabled; published Windows installers are unsigned and may show operating-system warnings.

