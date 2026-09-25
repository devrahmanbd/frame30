# Clothing-Heritage image manifest (HERITAGE-3)

Source of truth mapping every hardcoded hotlinked image slot in
`clothing-heritage` to a generatable replacement. Workflow: paste each
prompt into Gemini (user's Mac Chrome), download, upload via Dashboard →
Media (private `media` bucket, `media_assets` row), then HERITAGE-4 swaps
the URLs in the installed draft and republishes.

Global style suffix (append to every prompt):
`warm ivory background (#FAF8F5), terracotta accent (#C45D3E), soft natural
light, editorial fashion photography, photorealistic, no text, no watermark,
no logos`

## Hero carousel (3 slides, 21:9 wide)

1. `hero-weave.jpg` — "Bangladeshi woman handloom weaver at wooden pit loom, tangail taant cotton saree in progress, close craft detail" + style suffix
2. `hero-festive.jpg` — "Pure silk panjabi and jamdani saree flat festive arrangement for Eid celebration" + style suffix
3. `hero-artisans.jpg` — "Group of rural women artisans embroidering nakshi kantha quilt outdoors, daylight" + style suffix

## Lookbook (4 portrait 3:4)

4. `look-bohemian.jpg` — "Bohemian hand-embroidered tunic kurti on model, neutral studio backdrop, full body"
5. `look-jamdani.jpg` — "Dhakai jamdani heritage saree draped on model, heritage interior, full body"
6. `look-panjabi.jpg` — "Embroidered silk kurta panjabi on male model, minimal warm backdrop, full body"
7. `look-kantha.jpg` — "Hand-quilted nakshi artisan jacket on model, craft workshop backdrop"

## Textile showcase (4 square)

8. `tex-jamdani.jpg` — "Macro detail of dhakai jamdani weave geometric motifs"
9. `tex-taant.jpg` — "Macro detail of tangail taant cotton weave texture"
10. `tex-kantha.jpg` — "Macro detail of nakshi kantha running-stitch embroidery"
11. `tex-silk.jpg` — "Macro detail of raw silk fabric with mother-of-pearl button"

## Category headers (6 wide 16:9, one per department)

12. `cat-women.jpg`, 13. `cat-men.jpg`, 14. `cat-kids.jpg`,
13. `cat-home.jpg`, 16. `cat-jewellery.jpg`, 17. `cat-wedding.jpg`
    — each: "<department> heritage apparel flat-lay collection" + style suffix

## Artisan story (2 portrait)

18. `artisan-master.jpg` — "Portrait of elderly master weaver hands threading loom"
19. `artisan-story.jpg` — "Artisan family weaving together in village home"

## Social strip (1 wide)

20. `social-craft.jpg` — "Overhead flat-lay of threads, needles, fabric swatches and brass jewelry pieces"

## Swap map (HERITAGE-4 reference)

- `editorial_hero.imageUrl` → hero-weave.jpg
- `lookbook.i1..4Image` → look-*.jpg
- `social_strip` image → social-craft.jpg
- `split_feature` image → artisan-master.jpg
- `category_header` images → cat-*.jpg
- demo-catalog product `image_url` → matching tex-/look- files
