/* Utilities shared by the SoundCloud page scripts and the extension player. */
(() => {
    'use strict';

    const icons = Object.freeze({
        play: '<svg viewBox="0 0 16 16"><path d="M4 2v12l9-6z"/></svg>',
        pause: '<svg viewBox="0 0 16 16"><path d="M3.5 2h3v12h-3zM9.5 2h3v12h-3z"/></svg>',
    });
    const formatTime = (seconds) => {
        const whole = Math.max(0, Math.floor(seconds || 0));
        return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
    };
    const nextPath = (href) => {
        const url = new URL(href);
        url.searchParams.delete('client_id');
        return url.pathname + url.search;
    };

    window.__sceShared = Object.freeze({ icons, formatTime, nextPath });
})();
