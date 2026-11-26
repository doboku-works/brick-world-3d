import * as THREE from 'three';
import { WORLD_SIZE } from '../types';
import type { PlayCameraMode, PlayVehicleMode } from '../types';
import type { WorldState } from './worldState';
import type { SoundEngine } from './sound';

/**
 * Interactive Explore & Drive Mode!
 * Kids can walk around their giant 3D block creation as an animated Block Buddy
 * (climbing stairs, jumping onto rooftops, exploring inside houses in 1st person!)
 * OR hop into a snappy Block Kart and cruise around the 128x128 world!
 */
export class PlayController {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: WorldState;
  private sound: SoundEngine;
  private domElement: HTMLElement;

  public active = false;
  public vehicleMode: PlayVehicleMode = 'walk';
  public cameraMode: PlayCameraMode = 'third';

  public position = new THREE.Vector3(64, 0, 68);
  private velocity = new THREE.Vector3();
  public heading = Math.PI; // facing -Z toward starter village
  public camYaw = Math.PI;
  public camPitch = 0.34;
  private onGround = true;
  private walkPhase = 0;

  // Player 3D avatars
  private playerRoot = new THREE.Group();
  private figureGroup = new THREE.Group();
  private leftLegPivot = new THREE.Group();
  private rightLegPivot = new THREE.Group();
  private leftArmPivot = new THREE.Group();
  private rightArmPivot = new THREE.Group();

  private kartGroup = new THREE.Group();
  private kartWheels: THREE.Mesh[] = [];
  private kartHeadlight: THREE.SpotLight;

  // Input state
  private keys = new Set<string>();
  private isDraggingLook = false;
  private lookPointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private virtualForward = 0;
  private virtualRight = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    world: WorldState,
    sound: SoundEngine,
    domElement: HTMLElement
  ) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.sound = sound;
    this.domElement = domElement;

    this.buildFigureAvatar();
    this.kartHeadlight = this.buildKartAvatar();

    this.playerRoot.add(this.figureGroup);
    this.playerRoot.add(this.kartGroup);
    this.playerRoot.visible = false;
    this.scene.add(this.playerRoot);

    this.bindEvents();
  }

  private buildFigureAvatar() {
    const redMat = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.25 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x1d63dc, roughness: 0.25 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdfb8, roughness: 0.3 });
    const blushMat = new THREE.MeshStandardMaterial({ color: 0xfda4af, roughness: 0.35 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28 });

    // Legs & white sneakers with hip pivots
    this.leftLegPivot.position.set(-0.25, 0.84, 0);
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.64, 0.46), blueMat);
    lLeg.position.y = -0.32;
    lLeg.castShadow = true;
    const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.54), whiteMat);
    lShoe.position.set(0, -0.74, 0.03);
    this.leftLegPivot.add(lLeg, lShoe);
    this.figureGroup.add(this.leftLegPivot);

    this.rightLegPivot.position.set(0.25, 0.84, 0);
    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.64, 0.46), blueMat);
    rLeg.position.y = -0.32;
    rLeg.castShadow = true;
    const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.54), whiteMat);
    rShoe.position.set(0, -0.74, 0.03);
    this.rightLegPivot.add(rLeg, rShoe);
    this.figureGroup.add(this.rightLegPivot);

    // Blocky hoodie torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.82, 0.5), redMat);
    torso.position.y = 1.25;
    torso.castShadow = true;
    this.figureGroup.add(torso);

    // Cute white badge on chest (+Z is forward in avatar local space)
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.06), whiteMat);
    badge.position.set(0, 1.32, 0.26);
    this.figureGroup.add(badge);

    // Arms + cute cube-mitten hands with shoulder pivots
    this.leftArmPivot.position.set(-0.58, 1.56, 0);
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.26), redMat);
    lArm.position.y = -0.22;
    lArm.castShadow = true;
    const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), skinMat);
    lHand.position.set(0, -0.54, 0.02);
    this.leftArmPivot.add(lArm, lHand);
    this.figureGroup.add(this.leftArmPivot);

    this.rightArmPivot.position.set(0.58, 1.56, 0);
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.26), redMat);
    rArm.position.y = -0.22;
    rArm.castShadow = true;
    const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), skinMat);
    rHand.position.set(0, -0.54, 0.02);
    this.rightArmPivot.add(rArm, rHand);
    this.figureGroup.add(this.rightArmPivot);

    // Original cute cube-block head + rosy cheeks + cheerful smile!
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.54, 0.58), skinMat);
    head.position.y = 1.93;
    head.castShadow = true;
    this.figureGroup.add(head);

    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.05), darkMat);
    eyeL.position.set(-0.14, 1.98, 0.3);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.05), darkMat);
    eyeR.position.set(0.14, 1.98, 0.3);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.05), darkMat);
    mouth.position.set(0, 1.82, 0.3);
    const cheekL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.05), blushMat);
    cheekL.position.set(-0.23, 1.86, 0.3);
    const cheekR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.05), blushMat);
    cheekR.position.set(0.23, 1.86, 0.3);
    this.figureGroup.add(eyeL, eyeR, mouth, cheekL, cheekR);

    // Original cozy knit beanie hat + white pom-pom!
    const hatRim = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.64), redMat);
    hatRim.position.y = 2.22;
    const hatTop = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.52), redMat);
    hatTop.position.y = 2.34;
    const pom = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), whiteMat);
    pom.position.y = 2.46;
    this.figureGroup.add(hatRim, hatTop, pom);
  }

  private buildKartAvatar(): THREE.SpotLight {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.22 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.22 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e242b, roughness: 0.85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.7 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.62,
      roughness: 0.1,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xfff9c4,
      emissive: 0xfef08a,
      emissiveIntensity: 1.8,
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdfb8, roughness: 0.3 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x1d63dc, roughness: 0.25 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.28 });

    // Chassis
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 4.2), bodyMat);
    base.position.set(0, 0.72, 0);
    base.castShadow = true;
    this.kartGroup.add(base);

    // Hood & spoiler
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 1.35), accentMat);
    hood.position.set(0, 1.15, 1.25);
    hood.castShadow = true;
    this.kartGroup.add(hood);

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 0.45), accentMat);
    spoiler.position.set(0, 1.68, -1.85);
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.22), tireMat);
    postL.position.set(-0.75, 1.32, -1.85);
    const postR = postL.clone();
    postR.position.x = 0.75;
    this.kartGroup.add(spoiler, postL, postR);

    // Windshield
    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.68, 0.16), glassMat);
    ws.position.set(0, 1.55, 0.65);
    ws.rotation.x = -0.45;
    this.kartGroup.add(ws);

    // Headlights
    for (const sx of [-0.72, 0.72]) {
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 12), glowMat);
      hl.rotation.x = Math.PI / 2;
      hl.position.set(sx, 0.92, 2.12);
      this.kartGroup.add(hl);
    }

    // Original cube-headed driver seated inside!
    const driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.65, 0.45), blueMat);
    driverTorso.position.set(0, 1.32, -0.25);
    const driverHead = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.54), skinMat);
    driverHead.position.set(0, 1.88, -0.25);
    const driverHelmet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.24, 0.6), bodyMat);
    driverHelmet.position.set(0, 2.15, -0.25);
    const driverStripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.62), whiteMat);
    driverStripe.position.set(0, 2.16, -0.25);
    this.kartGroup.add(driverTorso, driverHead, driverHelmet, driverStripe);

    // 4 spinning tires!
    const wheelPositions: Array<[number, number]> = [
      [-1.25, 1.25],
      [1.25, 1.25],
      [-1.25, -1.25],
      [1.25, -1.25],
    ];
    for (const [wx, wz] of wheelPositions) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.46, 16), tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(wx, 0.54, wz);
      tire.castShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), rimMat);
      tire.add(rim);
      this.kartGroup.add(tire);
      this.kartWheels.push(tire);
    }

    // Subtle headlight spotlight for night cruising!
    const spot = new THREE.SpotLight(0xfff7c2, 0, 26, Math.PI / 4, 0.5, 1.2);
    spot.position.set(0, 1.1, 2.2);
    spot.target.position.set(0, 0.2, 12);
    this.kartGroup.add(spot);
    this.kartGroup.add(spot.target);
    return spot;
  }

  private bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      this.keys.add(e.code);
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.vehicleMode === 'car') {
          this.sound.playHorn();
          if (this.onGround) {
            this.velocity.y = 9.5;
            this.onGround = false;
          }
        } else if (this.onGround) {
          this.velocity.y = 11.8;
          this.onGround = false;
          this.sound.playJump();
        }
      }
      if (e.code === 'KeyV') {
        this.toggleCameraMode();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    this.domElement.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      const isTouch = e.pointerType === 'touch';
      if (!isTouch && e.button !== 0 && e.button !== 2) return;
      if (this.lookPointerId !== null) return;
      this.isDraggingLook = true;
      this.lookPointerId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.active || !this.isDraggingLook || e.pointerId !== this.lookPointerId) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      const yawSens = e.pointerType === 'touch' ? 0.008 : 0.0065;
      const pitchSens = e.pointerType === 'touch' ? 0.0062 : 0.005;
      this.camYaw -= dx * yawSens;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * pitchSens, -0.25, 1.15);
    });

    const endLook = (e: PointerEvent) => {
      if (e.pointerId === this.lookPointerId) {
        this.isDraggingLook = false;
        this.lookPointerId = null;
      }
    };
    window.addEventListener('pointerup', endLook);
    window.addEventListener('pointercancel', endLook);

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.isDraggingLook = false;
      this.lookPointerId = null;
      this.virtualForward = 0;
      this.virtualRight = 0;
    });
  }

  public enter(spawnX: number, spawnZ: number, vehicle: PlayVehicleMode = 'walk') {
    this.active = true;
    this.vehicleMode = vehicle;
    this.keys.clear();
    this.virtualForward = 0;
    this.virtualRight = 0;
    this.isDraggingLook = false;
    this.lookPointerId = null;

    // Smart open-plaza search: prefer a wide 5x5 open ground spot so the avatar
    // & third-person camera have a gorgeous unobstructed view of the build!
    let chosenX = THREE.MathUtils.clamp(spawnX, 4, WORLD_SIZE - 4);
    let chosenZ = THREE.MathUtils.clamp(spawnZ, 4, WORLD_SIZE - 4);
    let chosenY = 0;
    let foundOpenPlaza = false;

    // Pass 1: look for wide open ground (radius 2.4 clearance)
    for (let ring = 0; ring <= 24 && !foundOpenPlaza; ring += 2) {
      const steps = ring === 0 ? 1 : Math.max(8, Math.round(ring * 3));
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2 + 0.6;
        const tx = THREE.MathUtils.clamp(spawnX + Math.cos(ang) * ring, 4, WORLD_SIZE - 4);
        const tz = THREE.MathUtils.clamp(spawnZ + Math.sin(ang) * ring, 4, WORLD_SIZE - 4);
        const h = this.world.getSupportHeightAt(tx, tz, 35, 35);
        if (h <= 0.45 && !this.world.isSpaceBlocked(tx, h, tz, 2.3, 3.0)) {
          chosenX = tx;
          chosenZ = tz;
          chosenY = h;
          foundOpenPlaza = true;
          break;
        }
      }
    }

    // Pass 2 fallback: any single-tile open ground spot
    if (!foundOpenPlaza) {
      const radius = vehicle === 'car' ? 1.15 : 0.55;
      for (let ring = 0; ring <= 20 && !foundOpenPlaza; ring += 1.5) {
        const steps = ring === 0 ? 1 : Math.max(8, Math.round(ring * 4));
        for (let i = 0; i < steps; i++) {
          const ang = (i / steps) * Math.PI * 2;
          const tx = THREE.MathUtils.clamp(spawnX + Math.cos(ang) * ring, 3, WORLD_SIZE - 3);
          const tz = THREE.MathUtils.clamp(spawnZ + Math.sin(ang) * ring, 3, WORLD_SIZE - 3);
          const h = this.world.getSupportHeightAt(tx, tz, 35, 35);
          if (h <= 0.45 && !this.world.isSpaceBlocked(tx, h, tz, radius, 2.5)) {
            chosenX = tx;
            chosenZ = tz;
            chosenY = h;
            foundOpenPlaza = true;
            break;
          }
        }
      }
    }

    if (!foundOpenPlaza) {
      chosenY = this.world.getSupportHeightAt(chosenX, chosenZ, 35, 35);
    }

    this.position.set(chosenX, chosenY + 0.05, chosenZ);
    this.velocity.set(0, 0, 0);
    this.onGround = true;

    // Face toward the target structure so kids immediately admire what they built!
    const dx = spawnX - chosenX;
    const dz = spawnZ - chosenZ;
    if (dx * dx + dz * dz > 1.5) {
      this.heading = Math.atan2(dx, dz);
      this.camYaw = this.heading + Math.PI;
    } else {
      this.heading = Math.PI;
      this.camYaw = 0.25;
    }
    this.camPitch = 0.42;

    this.syncAvatarVisibility();
    this.playerRoot.visible = true;
    this.playerRoot.position.copy(this.position);
    this.playerRoot.rotation.y = this.heading;
    // Snap third-person camera cleanly on entry
    const isCar = vehicle === 'car';
    const dist = isCar ? 11.5 : 8.5;
    const lookY = this.position.y + (isCar ? 1.6 : 1.9);
    const horiz = Math.cos(this.camPitch) * dist;
    const vert = Math.sin(this.camPitch) * dist;
    this.camera.position.set(
      this.position.x + Math.sin(this.camYaw) * horiz,
      Math.max(1.5, lookY + vert),
      this.position.z + Math.cos(this.camYaw) * horiz
    );
    this.camera.lookAt(this.position.x, lookY, this.position.z);
  }

  public exit() {
    this.active = false;
    this.keys.clear();
    this.isDraggingLook = false;
    this.lookPointerId = null;
    this.virtualForward = 0;
    this.virtualRight = 0;
    this.playerRoot.visible = false;
  }

  public setVirtualMove(forward: number, right: number) {
    this.virtualForward = THREE.MathUtils.clamp(forward, -1, 1);
    this.virtualRight = THREE.MathUtils.clamp(right, -1, 1);
  }

  public setVehicleMode(mode: PlayVehicleMode) {
    this.vehicleMode = mode;
    this.syncAvatarVisibility();
    if (mode === 'car') {
      this.sound.playHorn();
    } else {
      this.sound.playClick(520);
    }
  }

  public toggleCameraMode(): PlayCameraMode {
    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
    this.syncAvatarVisibility();
    this.sound.playClick(620);
    return this.cameraMode;
  }

  public setNightMode(isNight: boolean) {
    this.kartHeadlight.intensity = isNight ? 3.2 : 0;
  }

  private syncAvatarVisibility() {
    const showAvatar = this.cameraMode === 'third';
    this.figureGroup.visible = showAvatar && this.vehicleMode === 'walk';
    this.kartGroup.visible = showAvatar && this.vehicleMode === 'car';
  }

  public triggerMobileJump() {
    if (!this.active) return;
    if (this.vehicleMode === 'car') {
      this.sound.playHorn();
    }
    if (this.onGround) {
      this.velocity.y = this.vehicleMode === 'car' ? 9.5 : 11.8;
      this.onGround = false;
      if (this.vehicleMode === 'walk') this.sound.playJump();
    }
  }

  public update(dt: number) {
    if (!this.active) return;
    const clampedDt = Math.min(dt, 0.05);

    // Optional Q/E camera rotate
    if (this.keys.has('KeyQ')) this.camYaw += 2.1 * clampedDt;
    if (this.keys.has('KeyE')) this.camYaw -= 2.1 * clampedDt;

    // Input direction relative to camera yaw (keyboard + virtual joystick combined)
    let keyForward = 0;
    let keyRight = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) keyForward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) keyForward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) keyRight += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) keyRight -= 1;

    const inputForward = THREE.MathUtils.clamp(keyForward + this.virtualForward, -1, 1);
    const inputRight = THREE.MathUtils.clamp(keyRight + this.virtualRight, -1, 1);

    const isCar = this.vehicleMode === 'car';
    const maxSpeed = isCar ? 20 : 10.5;
    const radius = isCar ? 0.95 : 0.42;
    const bodyHeight = isCar ? 2.1 : 2.35;
    const stepUp = isCar ? 0.85 : 1.28; // Block buddy easily climbs 1-brick steps & stairs!

    const forwardDir = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const rightDir = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const moveDir = new THREE.Vector3()
      .addScaledVector(forwardDir, inputForward)
      .addScaledVector(rightDir, inputRight);

    const moving = moveDir.lengthSq() > 0.01;
    if (moving) {
      const magnitude = Math.min(1, moveDir.length());
      moveDir.normalize();
      const targetHeading = Math.atan2(moveDir.x, moveDir.z);
      // Shortest angle interpolation
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, clampedDt * (isCar ? 8 : 13));

      // Gently follow behind car in third-person
      if (isCar && !this.isDraggingLook && inputForward > 0) {
        let camDiff = targetHeading + Math.PI - this.camYaw;
        while (camDiff > Math.PI) camDiff -= Math.PI * 2;
        while (camDiff < -Math.PI) camDiff += Math.PI * 2;
        this.camYaw += camDiff * Math.min(1, clampedDt * 2.2);
      }

      const accel = isCar ? 24 : 36;
      const targetSpeed = maxSpeed * magnitude;
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveDir.x * targetSpeed, Math.min(1, accel * clampedDt * 0.25));
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveDir.z * targetSpeed, Math.min(1, accel * clampedDt * 0.25));
    } else {
      const drag = Math.exp(-(isCar ? 5 : 11) * clampedDt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
    }

    // Horizontal movement with smooth step-up & collision sliding
    const tryMoveAxis = (nx: number, nz: number): boolean => {
      const cx = THREE.MathUtils.clamp(nx, 1.2, WORLD_SIZE - 1.2);
      const cz = THREE.MathUtils.clamp(nz, 1.2, WORLD_SIZE - 1.2);
      if (!this.world.isSpaceBlocked(cx, this.position.y, cz, radius, bodyHeight)) {
        this.position.x = cx;
        this.position.z = cz;
        return true;
      }
      // Try auto step-up onto a stair or brick!
      const supportY = this.world.getSupportHeightAt(cx, cz, this.position.y, stepUp);
      if (
        supportY > this.position.y &&
        supportY <= this.position.y + stepUp &&
        !this.world.isSpaceBlocked(cx, supportY, cz, radius, bodyHeight)
      ) {
        this.position.x = cx;
        this.position.z = cz;
        this.position.y = supportY;
        return true;
      }
      return false;
    };

    const nextX = this.position.x + this.velocity.x * clampedDt;
    if (!tryMoveAxis(nextX, this.position.z)) {
      this.velocity.x = 0;
    }
    const nextZ = this.position.z + this.velocity.z * clampedDt;
    if (!tryMoveAxis(this.position.x, nextZ)) {
      this.velocity.z = 0;
    }

    // Gravity & ground support
    this.velocity.y -= 28 * clampedDt;
    this.position.y += this.velocity.y * clampedDt;

    // Sample 4 footprint corners so player doesn't slip off edges prematurely
    let floorY = this.world.getSupportHeightAt(this.position.x, this.position.z, this.position.y, 0.25);
    const r = radius * 0.65;
    for (const [ox, oz] of [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ]) {
      const h = this.world.getSupportHeightAt(this.position.x + ox, this.position.z + oz, this.position.y, 0.25);
      if (h > floorY && h <= this.position.y + 0.35) floorY = h;
    }

    if (this.position.y <= floorY) {
      this.position.y = floorY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // Animate Block Buddy limbs / Kart wheels!
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!isCar) {
      if (horizSpeed > 0.4 && this.onGround) {
        this.walkPhase += horizSpeed * clampedDt * 1.45;
        const swing = Math.sin(this.walkPhase) * 0.72;
        this.leftLegPivot.rotation.x = swing;
        this.rightLegPivot.rotation.x = -swing;
        this.leftArmPivot.rotation.x = -swing * 0.85;
        this.rightArmPivot.rotation.x = swing * 0.85;
      } else if (!this.onGround) {
        // Joyful jump pose!
        this.leftArmPivot.rotation.x = -2.4;
        this.rightArmPivot.rotation.x = -2.4;
        this.leftLegPivot.rotation.x = 0.35;
        this.rightLegPivot.rotation.x = -0.25;
      } else {
        this.leftLegPivot.rotation.x *= 0.8;
        this.rightLegPivot.rotation.x *= 0.8;
        this.leftArmPivot.rotation.x *= 0.8;
        this.rightArmPivot.rotation.x *= 0.8;
      }
    } else {
      for (const w of this.kartWheels) {
        w.rotation.x += horizSpeed * clampedDt * 1.9;
      }
    }

    this.playerRoot.position.copy(this.position);
    this.playerRoot.rotation.y = this.heading;

    // Update Camera
    if (this.cameraMode === 'first') {
      const eyeH = isCar ? 1.85 : 2.05;
      const eyePos = new THREE.Vector3(this.position.x, this.position.y + eyeH, this.position.z);
      const lookDir = new THREE.Vector3(
        -Math.sin(this.camYaw) * Math.cos(this.camPitch),
        -Math.sin(this.camPitch),
        -Math.cos(this.camYaw) * Math.cos(this.camPitch)
      );
      this.camera.position.copy(eyePos);
      this.camera.lookAt(eyePos.clone().add(lookDir));
    } else {
      const dist = isCar ? 11.5 : 8.5;
      const lookY = this.position.y + (isCar ? 1.6 : 1.9);
      const lookTarget = new THREE.Vector3(this.position.x, lookY, this.position.z);
      const horiz = Math.cos(this.camPitch) * dist;
      const vert = Math.sin(this.camPitch) * dist;
      const desiredCam = new THREE.Vector3(
        this.position.x + Math.sin(this.camYaw) * horiz,
        Math.max(1.2, lookY + vert),
        this.position.z + Math.cos(this.camYaw) * horiz
      );

      // Pull camera forward if a brick wall or roof is between player and camera!
      const rayDir = desiredCam.clone().sub(lookTarget);
      const rayDist = rayDir.length();
      if (rayDist > 0.5) {
        rayDir.divideScalar(rayDist);
        const hit = this.world.raycast(lookTarget, rayDir, rayDist);
        if (hit && hit.type === 'brick' && hit.distance > 1.8 && hit.distance < rayDist - 0.4) {
          desiredCam.copy(lookTarget).addScaledVector(rayDir, hit.distance - 0.65);
        }
      }

      this.camera.position.lerp(desiredCam, Math.min(1, clampedDt * 12));
      this.camera.lookAt(lookTarget);
    }
  }
}
