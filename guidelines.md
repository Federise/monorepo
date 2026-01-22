# Project Guidelines

> These guidelines are used by the **Manager** role during workflow reviews.
> The Manager will reject plans or implementations that violate these constraints.
> The Manager and Implementer will work together, iteratively until an implementation is reached that follows all guidelines.
> If it is determined that it is not possible to implement without contravening guidelines the manager should abort the work, and explain why.
> Manager should log its interventions into interventions.md

---

## Architecture Constraints

- [ ] All app actions must flow through the SDK, not direct API calls from apps
- [ ] All gateway endpoints must be associated with a permission.
- [ ] Third party apps never see secrets, credentials, or gateway endpoints. All access is brokered through the frame as a proxy.
- [ ] When we change a contract (api, function arguments, etc), we need to check all the places that may be effected by that change and either update them to the new method, or specifically call them out to the user if that is possible. We never have backwards compatibility. Better to remove and break then have backwards compatability.

We always move forward. We are in startup mode. No backwards compatability. No versioning. No migrations. We break things. We want to keep the code as small and generic as possible.

---

## Security Constraints

<!-- Non-negotiable security requirements -->

- [ ] Principle of least privlidge
- [ ] Capability-Based Sandboxing
- [ ] No secrets in client-side code, with the exception of the proxy/frame.
- [ ] All external input must be validated
- [ ] Authentication required for protected endpoints
- [ ] Links which grant capabilities/reveal secrets should always go to federise.org. 


Intersection of Privileges: The User has a set of rights. The App has a set of requested/granted rights. The Result: The app can only read text files, and only the ones the user actually owns. It cannot use the user's authority to do things the app wasn't granted, nor can it do things the app wants if the user lacks the permission.

We should be able to ask the following questions. What is the worst thing a third party app can do when the user is on their app? What about when they are not.
We accept the risk of data exfiltration for data that must pass through apps. The app could also maliciously overuse the capabilities it has been granted. That is the furthest risk we are willing to accept.

Any third party app is a Blind Delegate. It creates the request, but the signing/authentication happens in a layer the app cannot access (like a hardware security module or a separate system process). Apps only see what are relevant to them.

---

## Code Quality Gates

- [ ] No new dependencies without explicit justification
- [ ] Changes must not break existing functionality
- [ ] Follow existing patterns in the codebase (don't introduce new paradigms)
- [ ] We have a vanilla configuration. No special casing, or advanced config should be necessary.

---

## Ambiguity Policy

> **If any requirement is ambiguous, unclear, or could be interpreted multiple ways, the Manager MUST halt and request clarification rather than assume intent.**

---

