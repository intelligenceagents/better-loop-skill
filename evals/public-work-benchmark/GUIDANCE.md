# Additional guidance for the with-guidance arm

Use the same frozen challenge, sources, cases, output format and resource conditions as baseline. Before producing the JSON, trace these boundaries in the source:

1. Identify the exact acceptance conditions and the state captured before asynchronous work.
2. Distinguish caller-owned objects, reviewer copies, the returned preparation and the returned approval.
3. Check identity separately from content equality. Trace canonicalization before deciding whether an edit changes the compared content.
4. Evaluate both allowed and rejected cases. A blanket rejection policy does not complete this task.
5. Check your final JSON for case coverage, valid reasons and claims supported by this local behavior.

Produce only the requested answer. This is guidance for a bounded read-only reasoning task; it grants no tool, network, mutation or publication authorization.
