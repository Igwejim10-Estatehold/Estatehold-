---
name: Estatehold property verification priority
description: User's priority for camera and location evidence in property listing.
---

Live camera and GPS proof at the listed property is a top priority for reducing fake-landlord risk.

**Why:** The user identified fake-landlord fraud as the reason this evidence matters most.

**How to apply:** Keep live camera and location proof prominent in property listing and verification workflows.

For coordinate assertions sourced from EXIF GPS, compare at the six-decimal display precision (or an equivalent small tolerance), not with exact floating-point equality.

**Why:** EXIF encodes coordinates as rational degrees/minutes/seconds; converting them back to decimal degrees can introduce sub-microdegree rounding differences.

**How to apply:** Keep visible and submitted coordinates aligned while allowing harmless EXIF conversion precision noise in tests.
