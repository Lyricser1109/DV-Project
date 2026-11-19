// Shared dropdown navigation for mouse, touch and keyboard users.
document.querySelectorAll(".nav-dropdown").forEach(dropdown => {
    const toggle = dropdown.querySelector(".nav-dropdown-toggle");
    const panel = dropdown.querySelector(".nav-dropdown-panel");
    const links = panel.querySelectorAll("a");

    const positionPanel = () => {
        const bounds = dropdown.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const left = Math.max(12, Math.min(bounds.right - panel.offsetWidth, viewportWidth - panel.offsetWidth - 12));
        panel.style.left = `${left - bounds.left}px`;
    };

    const setOpen = open => {
        toggle.setAttribute("aria-expanded", String(open));
        panel.hidden = !open;
        if (open) positionPanel();
    };

    toggle.addEventListener("click", () => setOpen(panel.hidden));
    toggle.addEventListener("keydown", event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            links[event.key === "ArrowDown" ? 0 : links.length - 1].focus();
        }
    });

    document.addEventListener("pointerdown", event => {
        if (!dropdown.contains(event.target)) setOpen(false);
    });
    document.addEventListener("focusin", event => {
        if (!dropdown.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) {
            event.preventDefault();
            const returnFocus = dropdown.contains(document.activeElement);
            setOpen(false);
            if (returnFocus) toggle.focus();
        }
    });

    window.addEventListener("resize", () => {
        if (!panel.hidden) positionPanel();
    });
});
