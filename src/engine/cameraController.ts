import * as THREE from 'three';
import { WORLD_SIZE } from '../types';

export class CameraController {
  public readonly camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;

  // Target & spherical coordinates (smoothly damped)
  public target = new THREE.Vector3(60, 2, 59);
  private desiredTarget = new THREE.Vector3(60, 2, 59);

  public yaw = 0.72; // radians around Y
  public pitch = 0.58; // radians above horizon
  public distance = 36;

  private desiredYaw = 0.72;
  private desiredPitch = 0.58;
  private desiredDistance = 36;

  private keys = new Set<string>();
  public enabled = true;
  public allowSingleTouchOrbit = true;

  private dragMode: 'none' | 'orbit' | 'pan' = 'none';
  private lastPointerX = 0;
  private lastPointerY = 0;
  public movedDuringDrag = false;

  // Touch state
  private activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;
  private lastPinchMidX = 0;
  private lastPinchMidY = 0;
  private touchOrbitPointerId: number | null = null;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchOrbitActivated = false;
  private hadMultiTouch = false;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.syncImmediate();
    this.bindEvents();
  }

  private bindEvents() {
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    this.domElement.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;

      if (e.pointerType === 'touch') {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.activePointers.size === 1) {
          this.touchOrbitPointerId = e.pointerId;
          this.touchStartX = e.clientX;
          this.touchStartY = e.clientY;
          this.lastPointerX = e.clientX;
          this.lastPointerY = e.clientY;
          this.touchOrbitActivated = false;
          this.hadMultiTouch = false;
          this.movedDuringDrag = false;
          this.dragMode = 'none';
        } else if (this.activePointers.size === 2) {
          // Two-finger touch pinch & pan
          this.hadMultiTouch = true;
          this.touchOrbitActivated = false;
          this.dragMode = 'none';
          const pts = Array.from(this.activePointers.values());
          this.lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          this.lastPinchMidX = (pts[0].x + pts[1].x) * 0.5;
          this.lastPinchMidY = (pts[0].y + pts[1].y) * 0.5;
        } else {
          this.hadMultiTouch = true;
          this.touchOrbitActivated = false;
          this.dragMode = 'none';
        }
        return;
      }

      if (e.button === 2 || (e.button === 0 && e.altKey)) {
        this.dragMode = 'orbit';
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.movedDuringDrag = false;
      } else if (e.button === 1) {
        this.dragMode = 'pan';
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.movedDuringDrag = false;
        e.preventDefault();
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;

      if (e.pointerType === 'touch') {
        if (!this.activePointers.has(e.pointerId)) return;
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.activePointers.size === 2) {
          const pts = Array.from(this.activePointers.values());
          const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          const midX = (pts[0].x + pts[1].x) * 0.5;
          const midY = (pts[0].y + pts[1].y) * 0.5;

          if (this.lastPinchDist > 1) {
            const factor = this.lastPinchDist / Math.max(1, dist);
            this.desiredDistance = THREE.MathUtils.clamp(this.desiredDistance * factor, 6, 180);
          }
          this.panByScreenDelta(midX - this.lastPinchMidX, midY - this.lastPinchMidY);
          this.lastPinchDist = dist;
          this.lastPinchMidX = midX;
          this.lastPinchMidY = midY;
          return;
        }

        if (
          this.activePointers.size === 1 &&
          e.pointerId === this.touchOrbitPointerId &&
          !this.hadMultiTouch &&
          this.allowSingleTouchOrbit
        ) {
          if (!this.touchOrbitActivated) {
            if (Math.hypot(e.clientX - this.touchStartX, e.clientY - this.touchStartY) >= 8) {
              this.touchOrbitActivated = true;
              this.lastPointerX = e.clientX;
              this.lastPointerY = e.clientY;
              this.movedDuringDrag = true;
            }
            return;
          }
          const dx = e.clientX - this.lastPointerX;
          const dy = e.clientY - this.lastPointerY;
          this.lastPointerX = e.clientX;
          this.lastPointerY = e.clientY;
          this.desiredYaw -= dx * 0.0082;
          this.desiredPitch = THREE.MathUtils.clamp(this.desiredPitch + dy * 0.0072, 0.08, 1.46);
        }
        return;
      }

      if (this.dragMode === 'none') return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.movedDuringDrag = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      if (this.dragMode === 'orbit') {
        this.desiredYaw -= dx * 0.0068;
        this.desiredPitch = THREE.MathUtils.clamp(this.desiredPitch + dy * 0.0062, 0.08, 1.46);
      } else if (this.dragMode === 'pan') {
        this.panByScreenDelta(dx, dy);
      }
    });

    const endPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this.activePointers.delete(e.pointerId);
        if (this.activePointers.size === 2) {
          const pts = Array.from(this.activePointers.values());
          this.lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          this.lastPinchMidX = (pts[0].x + pts[1].x) * 0.5;
          this.lastPinchMidY = (pts[0].y + pts[1].y) * 0.5;
        } else if (this.activePointers.size < 2) {
          this.lastPinchDist = 0;
        }
        if (this.activePointers.size === 0) {
          this.touchOrbitPointerId = null;
          this.touchOrbitActivated = false;
          this.hadMultiTouch = false;
        } else if (e.pointerId === this.touchOrbitPointerId) {
          this.touchOrbitPointerId = null;
          this.touchOrbitActivated = false;
        }
        return;
      }

      if (e.button === 2 || e.button === 1 || e.button === 0) {
        this.dragMode = 'none';
      }
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    this.domElement.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.12 : 0.89;
        this.desiredDistance = THREE.MathUtils.clamp(this.desiredDistance * factor, 6, 180);
      },
      { passive: false }
    );

    window.addEventListener('keydown', (e) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragMode = 'none';
      this.activePointers.clear();
      this.lastPinchDist = 0;
      this.touchOrbitPointerId = null;
      this.touchOrbitActivated = false;
      this.hadMultiTouch = false;
    });
  }

  private panByScreenDelta(dx: number, dy: number) {
    const panSpeed = this.distance * 0.0016;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.desiredTarget.addScaledVector(right, -dx * panSpeed);
    this.desiredTarget.addScaledVector(forward, dy * panSpeed);
    this.clampTarget();
  }

  private clampTarget() {
    this.desiredTarget.x = THREE.MathUtils.clamp(this.desiredTarget.x, 0, WORLD_SIZE);
    this.desiredTarget.z = THREE.MathUtils.clamp(this.desiredTarget.z, 0, WORLD_SIZE);
    this.desiredTarget.y = THREE.MathUtils.clamp(this.desiredTarget.y, 0, 38);
  }

  public focusOn(x: number, z: number, dist?: number) {
    this.desiredTarget.set(
      THREE.MathUtils.clamp(x, 0, WORLD_SIZE),
      2,
      THREE.MathUtils.clamp(z, 0, WORLD_SIZE)
    );
    if (dist !== undefined) {
      this.desiredDistance = THREE.MathUtils.clamp(dist, 6, 180);
    }
  }

  public resetView() {
    this.desiredTarget.set(60, 2, 59);
    this.desiredYaw = 0.72;
    this.desiredPitch = 0.56;
    this.desiredDistance = 36;
  }

  public zoomOverview() {
    this.desiredTarget.set(WORLD_SIZE * 0.5, 2, WORLD_SIZE * 0.5);
    this.desiredPitch = 0.85;
    this.desiredDistance = 128;
  }

  public rotateStep(deltaYaw: number) {
    this.desiredYaw += deltaYaw;
  }

  public zoomStep(factor: number) {
    this.desiredDistance = THREE.MathUtils.clamp(this.desiredDistance * factor, 6, 180);
  }

  public syncImmediate() {
    this.target.copy(this.desiredTarget);
    this.yaw = this.desiredYaw;
    this.pitch = this.desiredPitch;
    this.distance = this.desiredDistance;
    this.applyCameraTransform();
  }

  private applyCameraTransform() {
    const horiz = Math.cos(this.pitch) * this.distance;
    const vert = Math.sin(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horiz,
      Math.max(1.2, this.target.y + vert),
      this.target.z + Math.cos(this.yaw) * horiz
    );
    this.camera.lookAt(this.target);
  }

  public update(dt: number) {
    if (!this.enabled) return;
    const clampedDt = Math.min(dt, 0.05);

    // Keyboard WASD / Arrow smooth pan across the huge 128x128 world
    const moveSpeed = Math.max(14, this.distance * 0.78) * clampedDt;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      this.desiredTarget.addScaledVector(forward, moveSpeed);
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      this.desiredTarget.addScaledVector(forward, -moveSpeed);
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      this.desiredTarget.addScaledVector(right, moveSpeed);
    }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      this.desiredTarget.addScaledVector(right, -moveSpeed);
    }
    if (this.keys.has('KeyQ')) {
      this.desiredYaw += 1.6 * clampedDt;
    }
    if (this.keys.has('KeyE')) {
      this.desiredYaw -= 1.6 * clampedDt;
    }
    this.clampTarget();

    // Smooth exponential damping
    const lerpAlpha = 1 - Math.exp(-12 * clampedDt);
    this.target.lerp(this.desiredTarget, lerpAlpha);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.desiredYaw, lerpAlpha);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.desiredPitch, lerpAlpha);
    this.distance = THREE.MathUtils.lerp(this.distance, this.desiredDistance, lerpAlpha);

    this.applyCameraTransform();
  }
}
