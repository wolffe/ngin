/**
 * Pocket inventory. Stow removes the body from the world; drop respawns it
 * at the player's hold point via the item's `drop(pos)` factory.
 */

/**
 * @param {HTMLElement} hudEl
 */
export const createInventory = (hudEl) => {
    /** @type {Array<{ name: string, drop: (pos: {x:number,y:number,z:number}) => void }>} */
    const items = [];

    const syncHud = () => {
        if (!hudEl) return;
        if (items.length === 0) {
            hudEl.hidden = true;
            hudEl.textContent = '';
            return;
        }
        hudEl.hidden = false;
        const title = document.createElement('div');
        title.className = 'inv-title';
        title.textContent = 'Inventory';
        const lines = items.map((item, index) => {
            const line = document.createElement('div');
            line.textContent = `${index + 1}  ${item.name}`;
            return line;
        });
        const hint = document.createElement('div');
        hint.className = 'inv-hint';
        hint.textContent = '1–9 drop';
        hudEl.replaceChildren(title, ...lines, hint);
    };

    return {
        items,
        add(item) {
            items.push(item);
            syncHud();
        },
        take(index) {
            if (!Number.isInteger(index) || index < 0 || index >= items.length) return null;
            const item = items.splice(index, 1)[0];
            syncHud();
            return item;
        },
        syncHud,
        /**
         * @param {ReturnType<import('../input/InputManager.js').createInputManager>} input
         * @param {ReturnType<import('./Player.js').createPlayer>} player
         */
        pollDrop(input, player) {
            for (let i = 0; i < 9; i++) {
                if (!input.wasCodePressed(`Digit${i + 1}`)) continue;
                const item = this.take(i);
                if (!item) return;
                const pos = player.getHoldPoint();
                item.drop(pos);
                return;
            }
        },
    };
};
