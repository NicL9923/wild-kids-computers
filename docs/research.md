# Research notes

These notes explain the design rules in the [product spec](spec.md). The research ran on 2026-11-13.

Each finding has a status. "Checked" means the source was opened or found by search during the research. "From memory" means the finding was cited from recall and its source was not reopened. Verify a "from memory" finding before you cite it anywhere else.

## Why the app exists

GCompris and Tux Paint are the reference points, and both show their age.

- GCompris 26.2 shipped on 2026-09-23. Version 26.0 had 197 activities. The app runs on Qt and QML under AGPL-3.0 and targets ages 2 to 10. Checked: [GCompris news](https://gcompris.net/news-en.html).
- The GCompris "Computer" category has about 16 activities for pointer and keyboard skills, such as "My first mouse", "Click on me", "Double tap or double click", and "Simple letters". Checked: [GCompris activity list](https://gcompris.net/screenshots-en.html).
- Tux Paint 0.9.35 shipped in May 2025 under the GPL, with more than 90 Magic tools, stamps, and starters. It targets ages 3 to 12. Checked: [Tux Paint features](https://tuxpaint.org/features/).
- Neither app's activity list teaches desktop conventions such as windows, menus, files, copy and paste, and undo. The toy desktop area fills that gap.

## What makes an app teach

- Children learn from apps when the activity is active, engaging without distraction, meaningful, and social. Most top "educational" apps score low on these four. From memory: Hirsh-Pasek, Zosh, et al. 2015, *Psychological Science in the Public Interest*, and Meyer et al. 2021.
- Decoration that does not serve the learning goal hurts learning. From memory: Mayer's coherence principle, and Takacs, Swart, and Bus 2015 on children's e-books.
- A 2018 meta-analysis of 36 studies of touchscreen learning in ages 0 to 5 found a moderate positive effect that depended on active interaction and adult feedback. Checked by search: [Xie et al. 2018](https://frontiersin.org/article/10.3389/fpsyg.2018.02580/full).

These findings support hard rules 5 and 6.

## Pointer and keyboard skill by age

- Nielsen Norman Group tested children aged 3 to 12. For children under 9 on a desktop, dragging, scrolling, and clicking small objects with a mouse or trackpad are hard. Many younger children are more comfortable with a trackpad than a mouse. Checked: [NN/g, physical development](https://www.nngroup.com/articles/children-ux-physical-development/).
- Most 5 and 6-year-olds can click. Drag-and-drop causes more errors, partly because children release the button early. From memory: Donker and Reitsma 2007, *Computers & Education*.
- Larger targets help preschoolers a lot. From memory: Hourcade et al. 2004, *ACM TOCHI*.
- Touch-typing instruction usually starts at about ages 8 to 9. This is practitioner guidance with modest trial evidence.
- No source was found for trackpad, hover, right-click, or scroll skill by age.
- No study gives a validated minimum target size for each age. The sizes in the spec are estimates.

These findings support hard rule 7 and the activity order in the computer skills area.

## Rewards and manipulative design

- Expected tangible rewards undermine intrinsic motivation. Verbal praise does not. From memory: Deci, Koestner, and Ryan 1999, *Psychological Bulletin*.
- In a study of apps used by 160 children aged 3 to 5, about 80% of the apps had manipulative features, such as pressure from characters, fake time pressure, and lures to keep playing. Checked by search: Radesky et al. 2022, *JAMA Network Open*, doi 10.1001/jamanetworkopen.2022.17641.
- The American Academy of Pediatrics issued a policy statement in January 2026 that moves away from hourly limits and toward child-centered design over engagement-driven design. Checked through secondary coverage only: [Contemporary Pediatrics](https://www.contemporarypediatrics.com/view/aap-calls-for-system-level-changes-to-improve-children-s-digital-media-environments).

These findings support hard rule 4 and the session length design.

## Accessibility

- OpenDyslexic gave no reading benefit in a study of 12 students, and no participant preferred it. Checked by search: [Wery and Diliberto 2017](https://link.springer.com/article/10.1007/s11881-016-0127-1).
- Adjustable letter spacing and size have better support than a special font. From memory: Marinus et al. 2016.

## Privacy

- The amended COPPA rule had a full compliance date of 2026-04-22. It covers operators that collect personal information from children under 13. Checked by search: [Davis Polk client update](https://www.davispolk.com/insights/client-update/ftc-prioritizes-coppa-enforcement-new-compliance-obligations-take-effect).
- An offline app that collects nothing appears to be outside the rule. This reading is not legal advice.
- Hosting the browser build on a public site adds server logs, which the research did not cover. That is why public hosting is out of scope.

## Why Electron

The project first considered gpui, the Rust framework from Zed, and Bevy.

- The official `gpui` crate was still 0.2.2 from 2025-10-22. Zed staff said on 2026-10-30 to pin a git revision until automated releases start. Checked: [Zed issue 66275](https://github.com/zed-industries/zed/issues/66275).
- The gpui canvas is a 2D paint API with no way to import a GPU texture. Bitmaps go through a sprite atlas that frees an image only on an explicit `drop_image` call. Checked: [gpui-kit discussion 2594](https://github.com/longbridge/gpui-kit/discussions/2594) and [Celesta issue 684](https://github.com/mika-f/Celesta/issues/684).
- gpui has no audio, and touchscreen input could not be confirmed.
- Tauri 2 renders through WebKitGTK on Linux. Tauri's documentation warns that canvas content can silently run on a slow path there. Its bundled Chromium runtime was alpha in October 2026. Checked: [Tauri Linux graphics issues](https://v2.tauri.app/develop/debug/linux-graphics/) and [Tauri 3 CEF runtime](https://v3.tauri.app/develop/cef/).
- Electron ships the same Chromium on every operating system, with a raster canvas, audio, pointer events for mouse, touch, and pen, and screen-reader support built in. The cost is a larger installer and more memory. Neither cost was measured.

## Assets

- The Microsoft Fluent Emoji repository lists the MIT license. Checked: [fluentui-emoji](https://github.com/microsoft/fluentui-emoji). The emoji count and styles were not checked.
- Roundups describe Kokoro-82M as Apache-2.0 and Piper as GPL-3.0 with terms that vary by voice. The roundups are blog posts. Check the model card. Checked by search: [local TTS models with licenses](https://www.yaps.ai/blog/best-local-tts-models).

## Name

One search found a "WILD KIDS" trademark record for children's clothing and none for software. Similar software marks exist, such as "WILD KRATTS" and "PLAY WILD". The search is not a legal clearance. Checked by search: [trademark owner record](https://trademark.justia.com/owners/wild-kids-2198468).
