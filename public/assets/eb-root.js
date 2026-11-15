// The ConvertBuilder block this code belongs to (its <div id="ebl">), or null on our own pages.
// A page can carry two blocks – only the header on top, only the footer at the bottom – so every
// bundle takes the first #ebl that no other bundle has taken yet: its own, because a block's script
// runs right after the block's markup, inline as well as through landing/edubel-bg/load.js.
const blocks = [...document.querySelectorAll("#ebl")];
export const ROOT = blocks.find((el) => !el.dataset.ebTaken) || null;
if (ROOT) ROOT.dataset.ebTaken = "1";
