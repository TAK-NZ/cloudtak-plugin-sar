import { defineComponent, onMounted } from 'vue';
import type { Component } from 'vue';
import { useRouter } from 'vue-router';

/**
 * The menu only opens routes. The route of this plugin has no page: it runs `launch`
 * (which opens the bottom panel) and goes straight back to the map.
 */
export function createLaunchRoute(launch: () => void): Component {
    return defineComponent({
        name: 'SarLaunch',
        setup() {
            const router = useRouter();
            onMounted(() => {
                try {
                    launch();
                } finally {
                    void router.replace('/');
                }
            });
            return () => null;
        },
    });
}
