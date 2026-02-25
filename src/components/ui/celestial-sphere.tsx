import React, { useRef, useEffect } from "react";
import * as THREE from "three";

interface CelestialSphereProps {
    hue?: number;
    speed?: number;
    zoom?: number;
    particleSize?: number;
    className?: string;
}

export const CelestialSphere: React.FC<CelestialSphereProps> = ({
    hue = 210.0,
    speed = 0.4,
    zoom = 1.5,
    particleSize = 3.00,
    className = "",
}) => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        const currentMount = mountRef.current;
        let animationFrameId: number;
        const mouse = new THREE.Vector2(0.0, 0.0);

        // --- Shaders ---
        const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

        const fragmentShader = `
      precision highp float;
      varying vec2 vUv;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec2 u_mouse;
      uniform float u_hue;
      uniform float u_zoom;
      uniform float u_particle_size;

      // HSL to RGB conversion
      vec3 hsl2rgb(vec3 c) {
        vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        return c.z * mix(vec3(1.0), rgb, c.y);
      }

      // 2D Random
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      // Smooth 2D noise
      float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.y * u.x;
      }

      // Fractional Brownian Motion
      float fbm(vec2 st) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 6; i++) {
          value += amplitude * noise(st);
          st *= 2.17;
          amplitude *= 0.5;
        }
        return value;
      }

      // Domain-warped fbm for richer nebula effect
      float warpedFbm(vec2 p) {
        vec2 q = vec2(fbm(p + vec2(0.0, 0.0)), fbm(p + vec2(5.2, 1.3)));
        vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2)), fbm(p + 4.0 * q + vec2(8.3, 2.8)));
        return fbm(p + 4.0 * r);
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);
        uv *= u_zoom;

        // Parallax drift from mouse
        vec2 mouseNorm = (u_mouse / u_resolution) - 0.5;
        uv += mouseNorm * 0.35;

        // Time-based offset for animation
        vec2 animUv = uv + vec2(u_time * 0.04, u_time * 0.02);

        // Main nebula using domain-warped fbm
        float f = warpedFbm(animUv * 0.8);

        // Deep background layer
        float bg = fbm(uv * 0.5 + vec2(u_time * 0.01));

        // Nebula colors — two hue bands for depth
        vec3 col1 = hsl2rgb(vec3(u_hue / 360.0, 0.85, 0.55));
        vec3 col2 = hsl2rgb(vec3(mod(u_hue / 360.0 + 0.18, 1.0), 0.75, 0.45));
        vec3 col3 = hsl2rgb(vec3(mod(u_hue / 360.0 - 0.12, 1.0), 0.9, 0.3));

        vec3 nebulaColor = mix(col3, col2, f);
        nebulaColor = mix(nebulaColor, col1, pow(f, 2.5));
        nebulaColor *= pow(f, 1.2) * 2.8;

        // Background deep space gradient
        vec3 deepSpace = col3 * bg * 0.3;

        vec3 color = deepSpace + nebulaColor;

        // Layered starfield — three sizes for depth
        // Tiny background stars
        float s1 = random(vUv * 800.0 + 0.1);
        if (s1 > 0.9975) {
          float sb = (s1 - 0.9975) / 0.0025;
          color += vec3(sb * 0.6);
        }

        // Medium stars with slight twinkle
        float s2 = random(vUv * 400.0 + 0.7);
        if (s2 > 0.996) {
          float sb = (s2 - 0.996) / 0.004;
          float twinkle = 0.7 + 0.3 * sin(u_time * 3.0 + s2 * 100.0);
          color += vec3(sb * u_particle_size * 0.25 * twinkle);
        }

        // Bright foreground stars
        float s3 = random(vUv * 200.0 + 1.3);
        if (s3 > 0.9985) {
          float sb = (s3 - 0.9985) / 0.0015;
          float twinkle = 0.6 + 0.4 * sin(u_time * 2.0 + s3 * 200.0);
          // Slight color tint to stars
          vec3 starColor = mix(vec3(1.0), col1 + 0.5, 0.3);
          color += starColor * sb * u_particle_size * 0.55 * twinkle;
        }

        // Vignette
        float vignette = 1.0 - smoothstep(0.5, 1.6, length(uv));
        color *= vignette;

        // Tone mapping for HDR feel
        color = color / (color + vec3(0.8));
        color = pow(color, vec3(0.88));

        gl_FragColor = vec4(color, 1.0);
      }
    `;

        // --- Scene Initialization ---
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        currentMount.appendChild(renderer.domElement);

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                u_time: { value: 0.0 },
                u_resolution: { value: new THREE.Vector2() },
                u_mouse: { value: new THREE.Vector2() },
                u_hue: { value: hue },
                u_zoom: { value: zoom },
                u_particle_size: { value: particleSize },
            },
        });

        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // --- Resize Handler ---
        const resize = () => {
            const { clientWidth, clientHeight } = currentMount;
            renderer.setSize(clientWidth, clientHeight);
            material.uniforms.u_resolution.value.set(clientWidth, clientHeight);
        };

        // --- Mouse Handler ---
        const onMouseMove = (event: MouseEvent) => {
            const rect = currentMount.getBoundingClientRect();
            mouse.x = event.clientX - rect.left;
            mouse.y = event.clientY - rect.top;
            material.uniforms.u_mouse.value.set(mouse.x, currentMount.clientHeight - mouse.y);
        };

        // --- Touch Handler ---
        const onTouchMove = (event: TouchEvent) => {
            const rect = currentMount.getBoundingClientRect();
            const touch = event.touches[0];
            mouse.x = touch.clientX - rect.left;
            mouse.y = touch.clientY - rect.top;
            material.uniforms.u_mouse.value.set(mouse.x, currentMount.clientHeight - mouse.y);
        };

        // --- Animation Loop ---
        const animate = () => {
            material.uniforms.u_time.value += 0.016 * speed * 0.5;
            renderer.render(scene, camera);
            animationFrameId = requestAnimationFrame(animate);
        };

        window.addEventListener("resize", resize);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("touchmove", onTouchMove, { passive: true });

        resize();
        animate();

        // --- Cleanup ---
        return () => {
            window.removeEventListener("resize", resize);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("touchmove", onTouchMove);
            cancelAnimationFrame(animationFrameId);
            if (currentMount && renderer.domElement.parentNode === currentMount) {
                currentMount.removeChild(renderer.domElement);
            }
            geometry.dispose();
            material.dispose();
            renderer.dispose();
        };
    }, [hue, speed, zoom, particleSize]);

    return <div ref={mountRef} className={className || "w-full h-full"} />;
};

export default CelestialSphere;
