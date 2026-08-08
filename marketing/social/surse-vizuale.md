# Surse și prompturi vizuale

Imaginile editoriale din `assets/source/` au fost generate special pentru campania MINA. Textele și logo-ul au fost adăugate ulterior prin generatorul local, pentru lizibilitate și consecvență.

## `mina-editorial-photographer.png`

Prompt:

> Create a premium editorial brand photograph for MINA, a Romanian SaaS platform for professional photographers to deliver elegant online client galleries. Scene: a wedding photographer in a calm bright European studio, viewed slightly from behind and to the side, seated at a minimal light-oak desk, reviewing a refined wedding photo gallery on a slim laptop; one professional mirrorless camera and a small linen photo album nearby. Warm natural window light, soft ivory, charcoal, muted champagne-gold palette, quiet luxury, authentic documentary feeling, high-end European photography magazine art direction. Laptop screen should show a believable clean masonry gallery interface with wedding photographs but absolutely no readable interface text and no fake logos. Leave generous clean negative space in the upper-left for later typography. Photorealistic, sophisticated, not generic stock, subtle film grain, restrained depth of field. Portrait composition suitable for a 4:5 social post. No watermark, no embedded text, no brand logo.

## `mina-editorial-couple.png`

Prompt:

> Create a premium lifestyle editorial photograph for MINA, a Romanian online gallery platform for professional photographers. Close, natural scene of an elegant newlywed couple sitting together on a quiet sofa after their wedding, viewed over their shoulders while they look at a beautiful wedding gallery on a modern smartphone and lightly smile. The phone screen should show a believable clean grid of their wedding photographs with small heart selection cues, but absolutely no readable interface text and no fake logos. Authentic emotion, intimate documentary photography, soft late-afternoon window light, ivory, warm grey and muted champagne-gold palette, refined European aesthetic, subtle film grain, not commercial stock. Leave calm negative space near the top for later typography. Portrait 4:5 social composition. No watermark, no embedded text, no brand logo.

## Reproducerea exporturilor

Din rădăcina proiectului:

```bash
node marketing/social/render-assets.mjs
```

Comanda reface toate fișierele din `assets/final/` la aceleași dimensiuni.
