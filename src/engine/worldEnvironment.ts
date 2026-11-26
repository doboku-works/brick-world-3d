import * as THREE from 'three';
import { WORLD_SIZE } from '../types';
import type { TimeOfDay, WorldTheme } from '../types';

interface CloudInfo {
  mesh: THREE.Group;
  speed: number;
}

export class WorldEnvironment {
  private scene: THREE.Scene;
  private envGroup = new THREE.Group();

  // Baseplate meshes
  private basePlateMesh: THREE.Mesh;
  private basePlateCanvas: HTMLCanvasElement;
  private basePlateTex: THREE.CanvasTexture;
  private baseStudsMesh: THREE.InstancedMesh;
  private borderFrameMesh: THREE.Mesh;

  // Theme backdrops
  private meadowHillsGroup = new THREE.Group();
  private islandWaterMesh: THREE.Mesh;
  private spaceGroup = new THREE.Group();
  private starField!: THREE.Points;
  private cloudsGroup = new THREE.Group();
  private clouds: CloudInfo[] = [];

  // Lighting
  private sunLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private sunOrb: THREE.Mesh;
  private skyDome: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;

  public currentTheme: WorldTheme = 'meadow';
  public currentTime: TimeOfDay = 'day';
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.envGroup);

    // 1) Sky Dome Shader (smooth beautiful sky gradient!)
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color('#3898ff') },
        uHorizonColor: { value: new THREE.Color('#c7ebff') },
        uBottomColor: { value: new THREE.Color('#8bc34a') },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uBottomColor;
        varying vec3 vWorldPos;
        void main() {
          vec3 dir = normalize(vWorldPos - vec3(64.0, 0.0, 64.0));
          float h = dir.y;
          vec3 col = h >= 0.0
            ? mix(uHorizonColor, uTopColor, pow(clamp(h, 0.0, 1.0), 0.55))
            : mix(uHorizonColor, uBottomColor, clamp(-h * 3.0, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(520, 24, 16), this.skyMat);
    this.skyDome.position.set(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5);
    this.envGroup.add(this.skyDome);

    // 2) Lights
    this.hemiLight = new THREE.HemisphereLight(0xd8f3ff, 0x6ea858, 0.85);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaf0, 1.55);
    this.sunLight.position.set(110, 115, 95);
    this.sunLight.target.position.set(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 320;
    const d = 88;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.03;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.fillLight = new THREE.DirectionalLight(0x9ec5fe, 0.35);
    this.fillLight.position.set(10, 45, 15);
    scene.add(this.fillLight);

    this.sunOrb = new THREE.Mesh(
      new THREE.SphereGeometry(14, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff3a8 })
    );
    this.envGroup.add(this.sunOrb);

    // 3) Giant 128 x 128 Block Baseplate + crisp procedural texture
    this.basePlateCanvas = document.createElement('canvas');
    this.basePlateCanvas.width = 512;
    this.basePlateCanvas.height = 512;
    this.basePlateTex = new THREE.CanvasTexture(this.basePlateCanvas);
    this.basePlateTex.magFilter = THREE.NearestFilter;
    this.basePlateTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.basePlateTex.colorSpace = THREE.SRGBColorSpace;

    const plateGeo = new THREE.BoxGeometry(WORLD_SIZE, 1.2, WORLD_SIZE);
    const plateMat = new THREE.MeshStandardMaterial({
      map: this.basePlateTex,
      roughness: 0.35,
      metalness: 0.04,
    });
    this.basePlateMesh = new THREE.Mesh(plateGeo, plateMat);
    this.basePlateMesh.position.set(WORLD_SIZE * 0.5, -0.6, WORLD_SIZE * 0.5);
    this.basePlateMesh.receiveShadow = true;
    this.envGroup.add(this.basePlateMesh);

    // Subtle sturdy baseplate rim
    const borderGeo = new THREE.BoxGeometry(WORLD_SIZE + 1.6, 1.5, WORLD_SIZE + 1.6);
    const borderMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.55,
    });
    this.borderFrameMesh = new THREE.Mesh(borderGeo, borderMat);
    this.borderFrameMesh.position.set(WORLD_SIZE * 0.5, -0.82, WORLD_SIZE * 0.5);
    this.borderFrameMesh.receiveShadow = true;
    this.envGroup.add(this.borderFrameMesh);

    // 4) 128 x 128 = 16,384 3D Baseplate Studs in ONE InstancedMesh!
    // Lightweight open-bottom 8-sided cylinder + top cap (~16 tris/stud)
    const studGeo = new THREE.CylinderGeometry(0.295, 0.305, 0.14, 8, 1, false);
    studGeo.translate(0, 0.07, 0);
    const studMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.28,
      metalness: 0.04,
    });
    this.baseStudsMesh = new THREE.InstancedMesh(studGeo, studMat, WORLD_SIZE * WORLD_SIZE);
    this.baseStudsMesh.receiveShadow = true;
    this.baseStudsMesh.castShadow = false;
    this.baseStudsMesh.frustumCulled = false;
    this.envGroup.add(this.baseStudsMesh);

    // 5) Distant Meadow Hills & Horizon
    this.buildMeadowBackdrop();
    this.envGroup.add(this.meadowHillsGroup);

    // 6) Island Ocean Plane
    const waterGeo = new THREE.PlaneGeometry(900, 900, 32, 32);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.16,
      metalness: 0.12,
      transparent: true,
      opacity: 0.88,
    });
    this.islandWaterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.islandWaterMesh.position.set(WORLD_SIZE * 0.5, -0.35, WORLD_SIZE * 0.5);
    this.islandWaterMesh.receiveShadow = true;
    this.envGroup.add(this.islandWaterMesh);

    // 7) Space Stars & Giant Earth + Ringed Planet
    this.buildSpaceBackdrop();
    this.envGroup.add(this.spaceGroup);

    // 8) Floating Blocky Clouds!
    this.buildClouds();
    this.envGroup.add(this.cloudsGroup);

    this.applyTheme('meadow');
    this.applyTimeOfDay('day');
  }

  private buildMeadowBackdrop() {
    // Distant vast rolling green ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(490, 48),
      new THREE.MeshStandardMaterial({ color: 0x7bc96f, roughness: 0.85 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_SIZE * 0.5, -1.55, WORLD_SIZE * 0.5);
    ground.receiveShadow = true;
    this.meadowHillsGroup.add(ground);

    // Cheerful stepped toy-block mountains far on the horizon!
    const hillColors = [0x6abf69, 0x56ab59, 0x80d472, 0x6ec2b8, 0x8ecae6];
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 });
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2 + 0.18;
      const dist = 195 + (i % 3) * 45;
      const baseW = 42 + (i % 4) * 14;
      const tiers = 3 + (i % 2);
      const colMat = new THREE.MeshStandardMaterial({
        color: hillColors[i % hillColors.length],
        roughness: 0.82,
      });
      const mtn = new THREE.Group();
      for (let t = 0; t < tiers; t++) {
        const s = 1 - t * 0.27;
        const h = 7 + (i % 3) * 2.5;
        const tierMesh = new THREE.Mesh(
          new THREE.BoxGeometry(baseW * s, h, baseW * s * 0.85),
          t === tiers - 1 && tiers >= 4 ? snowMat : colMat
        );
        tierMesh.position.y = t * h + h * 0.5 - 2;
        mtn.add(tierMesh);
      }
      mtn.position.set(
        WORLD_SIZE * 0.5 + Math.cos(ang) * dist,
        0,
        WORLD_SIZE * 0.5 + Math.sin(ang) * dist
      );
      mtn.rotation.y = ang * 0.6;
      this.meadowHillsGroup.add(mtn);
    }
  }

  private buildSpaceBackdrop() {
    // Twinkling starfield
    const starCount = 900;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 240 + Math.random() * 210;
      positions[i * 3] = WORLD_SIZE * 0.5 + r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.max(-40, r * Math.cos(phi));
      positions[i * 3 + 2] = WORLD_SIZE * 0.5 + r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2.3, sizeAttenuation: true })
    );
    this.envGroup.add(this.starField);

    // Big blue Earth floating in the sky!
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(28, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5 })
    );
    earth.position.set(-55, 115, -75);
    this.spaceGroup.add(earth);

    // Green continents patches on Earth
    const contMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6 });
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 12), contMat);
    c1.position.set(-42, 122, -55);
    this.spaceGroup.add(c1);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 12), contMat);
    c2.position.set(-64, 108, -52);
    this.spaceGroup.add(c2);

    // Ringed Saturn-like planet!
    const saturn = new THREE.Mesh(
      new THREE.SphereGeometry(16, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45 })
    );
    saturn.position.set(215, 95, -50);
    this.spaceGroup.add(saturn);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(21, 31, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfde68a,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72,
      })
    );
    ring.position.copy(saturn.position);
    ring.rotation.x = Math.PI * 0.38;
    ring.rotation.y = 0.25;
    this.spaceGroup.add(ring);
  }

  private buildClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.0,
    });
    for (let i = 0; i < 16; i++) {
      const grp = new THREE.Group();
      const blocks = 3 + (i % 3);
      for (let b = 0; b < blocks; b++) {
        const w = 6 + ((i + b) % 4) * 2.5;
        const h = 2.4 + (b % 2) * 1.4;
        const d = 5 + ((i * 2 + b) % 3) * 2;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cloudMat);
        mesh.position.set((b - blocks * 0.5) * 4.2, (b % 2) * 1.1, ((b * 3) % 3 - 1) * 1.8);
        grp.add(mesh);
      }
      grp.position.set(
        Math.random() * 260 - 66,
        52 + Math.random() * 34,
        Math.random() * 260 - 66
      );
      this.cloudsGroup.add(grp);
      this.clouds.push({ mesh: grp, speed: 0.7 + Math.random() * 1.1 });
    }
  }

  /** Computes tile color & whether that tile has a stud for each of the 4 themes */
  private sampleTile(theme: WorldTheme, x: number, z: number): { color: string; stud: boolean } {
    if (theme === 'meadow') {
      // Subtle 32x32 giant baseplate seam + gentle grass variation
      const checker = ((Math.floor(x / 32) + Math.floor(z / 32)) % 2) === 0;
      const sub = ((x + z) % 2) === 0;
      return {
        color: checker ? (sub ? '#57b847' : '#52b243') : sub ? '#4fae41' : '#4ba73e',
        stud: true,
      };
    }

    if (theme === 'island') {
      const cx = x - WORLD_SIZE * 0.5;
      const cz = z - WORLD_SIZE * 0.5;
      const dist = Math.sqrt(cx * cx + cz * cz);
      const wobble = Math.sin(x * 0.14) * 3.2 + Math.cos(z * 0.13) * 3.2;
      const r = dist + wobble;
      if (r < 42) {
        return { color: (x + z) % 2 === 0 ? '#55ba47' : '#4eb241', stud: true };
      }
      if (r < 51) {
        return { color: (x + z) % 2 === 0 ? '#f3d893' : '#ecd088', stud: true };
      }
      // Shallow lagoon & ocean tiles (smooth water surface, still buildable for boats & docks!)
      if (r < 57) {
        return { color: '#38bdf8', stud: false };
      }
      return { color: '#0284c7', stud: false };
    }

    if (theme === 'city') {
      // Grid of city road plates! Cross-roads at x=[24..33, 60..69, 96..105] & z=[24..33, 60..69, 96..105]
      const inRoadBand = (v: number) =>
        (v >= 24 && v <= 33) || (v >= 60 && v <= 69) || (v >= 96 && v <= 105);
      const inSidewalk = (v: number) =>
        (v >= 22 && v <= 35) || (v >= 58 && v <= 71) || (v >= 94 && v <= 107);

      const rx = inRoadBand(x);
      const rz = inRoadBand(z);
      if (rx || rz) {
        // Crosswalk stripes near intersections
        const nearX = (x === 23 || x === 34 || x === 59 || x === 70 || x === 95 || x === 106);
        const nearZ = (z === 23 || z === 34 || z === 59 || z === 70 || z === 95 || z === 106);
        if (rx && rz) {
          return { color: '#475569', stud: false };
        }
        // Dashed yellow/white lane center line
        const isCenterX = (x === 28 || x === 29 || x === 64 || x === 65 || x === 100 || x === 101);
        const isCenterZ = (z === 28 || z === 29 || z === 64 || z === 65 || z === 100 || z === 101);
        if ((rx && isCenterX && z % 6 < 3) || (rz && isCenterZ && x % 6 < 3)) {
          return { color: '#f8fafc', stud: false };
        }
        if (nearX || nearZ) return { color: '#e2e8f0', stud: false };
        return { color: '#475569', stud: false };
      }
      if (inSidewalk(x) || inSidewalk(z)) {
        return { color: (x + z) % 2 === 0 ? '#cbd5e1' : '#c2cddb', stud: true };
      }
      // Central park block vs buildable green/plaza plots
      if (x > 35 && x < 58 && z > 35 && z < 58) {
        return { color: '#4eb849', stud: true };
      }
      return { color: (x + z) % 2 === 0 ? '#5ec254' : '#56ba4c', stud: true };
    }

    // Space Moon baseplate with craters & landing pads!
    const distPad = Math.hypot(x - 64, z - 64);
    if (distPad < 11 && distPad > 8.5) {
      return { color: '#facc15', stud: false };
    }
    if (distPad <= 8.5) {
      return { color: '#475569', stud: true };
    }
    const crater =
      Math.hypot(x - 28, z - 34) < 10 ||
      Math.hypot(x - 98, z - 92) < 13 ||
      Math.hypot(x - 96, z - 28) < 9 ||
      Math.hypot(x - 26, z - 98) < 11;
    if (crater) {
      return { color: '#64748b', stud: true };
    }
    return { color: (x + z) % 2 === 0 ? '#94a3b8' : '#8b9cb0', stud: true };
  }

  public applyTheme(theme: WorldTheme) {
    this.currentTheme = theme;
    const ctx = this.basePlateCanvas.getContext('2d')!;
    const cellPx = this.basePlateCanvas.width / WORLD_SIZE; // 4px per stud

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let studCount = 0;

    for (let z = 0; z < WORLD_SIZE; z++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        const tile = this.sampleTile(theme, x, z);
        ctx.fillStyle = tile.color;
        ctx.fillRect(x * cellPx, z * cellPx, cellPx, cellPx);

        // Faint stud grid line on texture
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(x * cellPx, z * cellPx, cellPx, 0.5);
        ctx.fillRect(x * cellPx, z * cellPx, 0.5, cellPx);

        if (tile.stud) {
          dummy.position.set(x + 0.5, 0, z + 0.5);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          this.baseStudsMesh.setMatrixAt(studCount, dummy.matrix);
          color.set(tile.color);
          this.baseStudsMesh.setColorAt(studCount, color);
          studCount++;
        }
      }
    }

    this.baseStudsMesh.count = studCount;
    this.baseStudsMesh.instanceMatrix.needsUpdate = true;
    if (this.baseStudsMesh.instanceColor) {
      this.baseStudsMesh.instanceColor.needsUpdate = true;
    }
    this.basePlateTex.needsUpdate = true;

    this.meadowHillsGroup.visible = theme === 'meadow' || theme === 'city';
    this.islandWaterMesh.visible = theme === 'island';
    this.spaceGroup.visible = theme === 'space';
    this.cloudsGroup.visible = theme !== 'space';

    const borderMat = this.borderFrameMesh.material as THREE.MeshStandardMaterial;
    if (theme === 'island') borderMat.color.setHex(0x0369a1);
    else if (theme === 'space') borderMat.color.setHex(0x1e293b);
    else borderMat.color.setHex(0x3f6212);

    this.applyTimeOfDay(this.currentTime);
  }

  public applyTimeOfDay(time: TimeOfDay) {
    this.currentTime = time;
    const isSpace = this.currentTheme === 'space';
    if (this.starField) {
      this.starField.visible = isSpace || time === 'night';
    }

    if (isSpace) {
      this.skyMat.uniforms.uTopColor.value.set('#020617');
      this.skyMat.uniforms.uHorizonColor.value.set('#0f172a');
      this.skyMat.uniforms.uBottomColor.value.set('#020617');
      this.scene.fog = new THREE.FogExp2(0x090f22, 0.0014);
      this.sunLight.color.set('#e2e8f0');
      this.sunLight.intensity = time === 'night' ? 0.7 : 1.35;
      this.sunLight.position.set(140, 110, 60);
      this.hemiLight.color.set('#64748b');
      this.hemiLight.groundColor.set('#1e293b');
      this.hemiLight.intensity = time === 'night' ? 0.45 : 0.7;
      this.sunOrb.visible = false;
      return;
    }

    this.sunOrb.visible = true;
    if (time === 'morning') {
      this.skyMat.uniforms.uTopColor.value.set('#4aa8ff');
      this.skyMat.uniforms.uHorizonColor.value.set('#ffe4c4');
      this.skyMat.uniforms.uBottomColor.value.set('#95d5b2');
      this.scene.fog = new THREE.Fog(0xffe9cf, 175, 430);
      this.sunLight.color.set('#fff1d0');
      this.sunLight.intensity = 1.4;
      this.sunLight.position.set(150, 75, 40);
      this.hemiLight.color.set('#e0f2fe');
      this.hemiLight.groundColor.set('#74c69d');
      this.hemiLight.intensity = 0.85;
      (this.sunOrb.material as THREE.MeshBasicMaterial).color.set('#ffe899');
    } else if (time === 'day') {
      this.skyMat.uniforms.uTopColor.value.set('#2b8cff');
      this.skyMat.uniforms.uHorizonColor.value.set('#cceeff');
      this.skyMat.uniforms.uBottomColor.value.set('#80cc6e');
      this.scene.fog = new THREE.Fog(0xcdeeff, 190, 460);
      this.sunLight.color.set('#fffcf2');
      this.sunLight.intensity = 1.55;
      this.sunLight.position.set(112, 125, 96);
      this.hemiLight.color.set('#e6f7ff');
      this.hemiLight.groundColor.set('#70b55b');
      this.hemiLight.intensity = 0.9;
      (this.sunOrb.material as THREE.MeshBasicMaterial).color.set('#fff7b0');
    } else if (time === 'sunset') {
      this.skyMat.uniforms.uTopColor.value.set('#3b3a8a');
      this.skyMat.uniforms.uHorizonColor.value.set('#ff8f6b');
      this.skyMat.uniforms.uBottomColor.value.set('#5a4668');
      this.scene.fog = new THREE.Fog(0xffa485, 165, 410);
      this.sunLight.color.set('#ff9e66');
      this.sunLight.intensity = 1.3;
      this.sunLight.position.set(-40, 52, 145);
      this.hemiLight.color.set('#ffd1b3');
      this.hemiLight.groundColor.set('#4c3d59');
      this.hemiLight.intensity = 0.72;
      (this.sunOrb.material as THREE.MeshBasicMaterial).color.set('#ff7b47');
    } else {
      // Night! Clear starlit moonlight so colors stay readable while lamps glow warmly!
      this.skyMat.uniforms.uTopColor.value.set('#0b1738');
      this.skyMat.uniforms.uHorizonColor.value.set('#223b70');
      this.skyMat.uniforms.uBottomColor.value.set('#101c36');
      this.scene.fog = new THREE.Fog(0x1b2f5c, 165, 430);
      this.sunLight.color.set('#b8d4ff');
      this.sunLight.intensity = 0.88;
      this.sunLight.position.set(18, 115, -20);
      this.hemiLight.color.set('#6888cc');
      this.hemiLight.groundColor.set('#263659');
      this.hemiLight.intensity = 0.68;
      (this.sunOrb.material as THREE.MeshBasicMaterial).color.set('#f8fafc');
    }

    this.sunOrb.position
      .copy(this.sunLight.position)
      .sub(new THREE.Vector3(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5))
      .normalize()
      .multiplyScalar(320)
      .add(new THREE.Vector3(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5));
  }

  public update(dt: number) {
    this.elapsed += dt;
    // Slowly drift blocky clouds across the sky!
    if (this.cloudsGroup.visible) {
      for (const c of this.clouds) {
        c.mesh.position.x += c.speed * dt;
        if (c.mesh.position.x > 205) {
          c.mesh.position.x = -75;
        }
      }
    }
    // Gentle shimmer on island ocean
    if (this.islandWaterMesh.visible) {
      this.islandWaterMesh.position.y = -0.36 + Math.sin(this.elapsed * 1.6) * 0.04;
    }
  }
}
