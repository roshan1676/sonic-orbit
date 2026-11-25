# Security and privacy

The desktop server binds to loopback and protects local mutation endpoints with an origin check and session token. It is not intended to be exposed to a LAN or public server. The extension captures only an explicitly chosen tab and stores audio preferences; it has no upload endpoint. Android reads only a file selected through the platform picker and declares no Internet, microphone or camera permissions.

Report suspected security issues privately using GitHub's private vulnerability reporting if enabled for this repository; otherwise contact the maintainer through the contact method on the GitHub profile. Avoid public issues containing exploit payloads, credentials, personal files or face images.

This alpha has not received an independent security audit. Download releases only from this repository and compare their SHA-256 hashes against `SHA256SUMS.txt`. Development APKs and the Windows launcher are not signed with a commercial release certificate. Do not disable device/browser protections to run an untrusted copy.
