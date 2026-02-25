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
  speed = 0.4,
  zoom = 1.5,
  particleSize = 3.0,
  className = "",
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;
    let scene: THREE.Scene;
    let camera: THREE.OrthographicCamera;
    let renderer: THREE.WebGLRenderer;
    let material: THREE.ShaderMaterial;
    let geometry: THREE.PlaneGeometry;
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

    // Blue-black-violet palette — hardcoded for the desired aesthetic
    const fragmentShader = `
      precision highp float;
      varying vec2 vUv;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec2 u_mouse;
      uniform float u_zoom;
      uniform float u_particle_size;

      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

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

      float fbm(vec2 st) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 6; i++) {
          value += amplitude * noise(st);
          st *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);
        uv *= u_zoom;

        // Mouse parallax
        vec2 mouseNorm = (u_mouse / u_resolution) - 0.5;
        uv += mouseNorm * 0.6;

        // Domain warp for rich swirling
        float f1 = fbm(uv + vec2(u_time * 0.08, u_time * 0.04));
        float f2 = fbm(uv + f1 + vec2(u_time * 0.04, u_time * 0.02));
        float nebula = pow(f2, 2.2);

        // --- Blue-black-violet palette ---
        // deep black base
        vec3 black      = vec3(0.0, 0.0, 0.02);
        // deep navy blue
        vec3 deepBlue   = vec3(0.02, 0.04, 0.25);
        // vivid electric blue
        vec3 blue       = vec3(0.05, 0.15, 0.7);
        // dark violet / indigo
        vec3 violet     = vec3(0.18, 0.02, 0.35);
        // bright violet-blue highlight
        vec3 highlight  = vec3(0.35, 0.1, 0.9);

        vec3 color = black;
        color = mix(color, deepBlue, smoothstep(0.0, 0.3, nebula));
        color = mix(color, violet,   smoothstep(0.2, 0.55, nebula));
        color = mix(color, blue,     smoothstep(0.4, 0.7, nebula));
        color = mix(color, highlight,smoothstep(0.65, 0.9, nebula));
        color *= nebula * 2.2 + 0.05;

        // Vignette — pulls edges to pure black
        float vignette = 1.0 - smoothstep(0.4, 1.5, length(uv));
        color *= vignette;

        // Stars — tiny white-blue points
        float s1 = random(vUv * 900.0 + 0.3);
        if (s1 > 0.9978) {
          float b1 = (s1 - 0.9978) / 0.0022;
          color += mix(vec3(0.6, 0.7, 1.0), vec3(1.0), b1) * b1 * 0.9;
        }

        // Bright twinkling stars
        float s2 = random(vUv * 300.0 + 1.7);
        if (s2 > 0.997) {
          float b2 = (s2 - 0.997) / 0.003;
          float twinkle = 0.65 + 0.35 * sin(u_time * 2.5 + s2 * 150.0);
          color += vec3(0.5, 0.6, 1.0) * b2 * u_particle_size * 0.3 * twinkle;
        }

        // Tone map
        color = color / (color + vec3(0.7));
        color = pow(color, vec3(0.9));

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // --- Scene ---
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    currentMount.appendChild(renderer.domElement);

    material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2() },
        u_mouse: { value: new THREE.Vector2() },
        u_zoom: { value: zoom },
        u_particle_size: { value: particleSize },
      },
    });

    geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // --- Handlers ---
    const resize = () => {
      const { clientWidth, clientHeight } = currentMount;
      renderer.setSize(clientWidth, clientHeight);
      material.uniforms.u_resolution.value.set(clientWidth, clientHeight);
      camera.updateProjectionMatrix();
    };

    const onMouseMove = (event: MouseEvent) => {
      const rect = currentMount.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      material.uniforms.u_mouse.value.set(mouse.x, currentMount.clientHeight - mouse.y);
    };

    // --- Animation ---
    const animate = () => {
      material.uniforms.u_time.value += 0.005 * speed;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove);
    resize();
    animate();

    // --- Cleanup ---
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(animationFrameId);
      if (currentMount && renderer.domElement.parentNode === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [speed, zoom, particleSize]);

  return <div ref={mountRef} className={className || "w-full h-full"} />;
};

export default CelestialSphere;
