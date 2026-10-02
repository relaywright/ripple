Fixes #{{issue}}

## Task and independent verification

{{report}}

## Before merging

The donor's machine ran type checks, unit tests, the production build, and formatting. Browser tests run in this pull request's `verify` check. These checks cannot judge visual quality, copy, or whether the simulation's assumptions still read honestly. For any visible change, check the flow at desktop width and at 390px, with the keyboard, and with reduced motion.

## Donated AI usage

| Field                           | Value               |
| ------------------------------- | ------------------- |
| Donor                           | @{{donor}}          |
| Selected model (donor-reported) | `{{model}}`         |
| Reasoning effort                | `{{effort}}`        |
| Runtime                         | {{seconds}} seconds |
| Base commit                     | `{{base}}`          |
| Policy digest                   | `{{policy}}`        |
| Token counts (donor-reported)   | {{usage}}           |

Model selection and token counts are donor-reported. Raw agent reports and command output remain local. Review the patch against the approved issue; the generated check summary does not establish acceptance. GitHub checks and maintainer review determine acceptance. No automatic merge.

{{receipt}}
