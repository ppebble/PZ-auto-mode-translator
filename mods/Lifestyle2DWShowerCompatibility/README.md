# Lifestyle + 2D Wardrobe Shower Compatibility

Build 42 compatibility patch for:

- Lifestyle: Hobbies (`LifestyleHobbies`, Workshop `3403870858`)
- 2Dimension Wardrobe (`4123567854998`, Workshop `3497748766`)

Lifestyle temporarily removes equipped clothing before its shower and bathtub
actions. This patch lets that normal flow run, then removes only 2D Wardrobe
items in `tdw:stylehead` and `tdw:styleskin` from Lifestyle's restore list and
immediately equips them again. Other clothing is still removed and restored by
Lifestyle as usual.

The Workshop/source copies of both dependencies are left unchanged.

