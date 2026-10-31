/*
 * Menu icon with a state dot.
 *
 * Wraps the Tabler radar icon and adds an 8 px dot while a calculation is running, so the state is visible
 * when the pane is closed. The host copies a menu item's fields when it is added, so the item cannot change
 * later. A render function that reads a reactive flag does update.
 *
 * The dot is never the only signal: the wrapper gets a title, and the text "Calculation running. " is added in
 * front of the label for screen readers (the icon comes before the label in the menu item).
 * The same approach as the Rubber Sheet plugin's menu icon.
 */
import { defineComponent, h } from 'vue';
import { IconRadar2 } from '@tabler/icons-vue';
import { session } from './state.ts';

const STYLE_ID = 'taknz-sar-menu-icon-style';
const STYLE = `
.taknz-sar-menu-icon { position: relative; display: inline-flex; }
.taknz-sar-menu-icon__dot {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 8px;
    height: 8px;
    box-sizing: content-box;
    border-radius: 50%;
    background-color: var(--tblr-primary, #1E90FF);
    /* The host sets --cloudtak-surface-bg for both themes on <html>; --cloudtak-panel-bg only exists inside panels. */
    border: 2px solid var(--cloudtak-panel-bg, var(--cloudtak-surface-bg, #ffffff));
}
@media (forced-colors: active) {
    .taknz-sar-menu-icon__dot {
        forced-color-adjust: none;
        background-color: Highlight;
        border-color: Canvas;
    }
}
.taknz-sar-menu-icon__text {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
`;

function ensureStyle(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = STYLE;
    document.head.appendChild(el);
}

/** Removes the style element. For the plugin's teardown. */
export function removeMenuIconStyle(): void {
    if (typeof document === 'undefined') return;
    document.getElementById(STYLE_ID)?.remove();
}

export const MenuIcon = defineComponent({
    name: 'SarMenuIcon',
    props: {
        size: { type: [Number, String], default: 32 },
        color: { type: String, default: 'currentColor' },
        stroke: { type: [Number, String], default: undefined },
    },
    setup(props) {
        ensureStyle();
        return () => {
            const hidden = session.run === 'running';
            return h('span', {
                class: 'taknz-sar-menu-icon',
                title: hidden ? 'SAR planning, calculation running' : undefined,
            }, [
                h(IconRadar2, { size: props.size, color: props.color, stroke: props.stroke === undefined ? undefined : String(props.stroke) }),
                hidden ? h('span', { class: 'taknz-sar-menu-icon__dot', 'aria-hidden': 'true' }) : null,
                hidden ? h('span', { class: 'taknz-sar-menu-icon__text' }, 'Calculation running. ') : null,
            ]);
        };
    },
});
