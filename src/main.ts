import './styles.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  MAX_HEIGHT,
  PLATE_HEIGHT,
  WORLD_SIZE,
  getRotatedSize,
} from './types';
import type {
  RayHit,
  Rotation,
  StampBrick,
  StampDef,
  TimeOfDay,
  ToolMode,
  WorldTheme,
} from './types';
import { getPartDef } from './data/parts';
import { BUILTIN_STAMPS, buildStarterWorldBricks } from './data/stamps';
import { MISSIONS } from './data/missions';
import { SoundEngine } from './engine/sound';
import { WorldState } from './engine/worldState';
import { BrickRenderer } from './engine/brickRenderer';
import { WorldEnvironment } from './engine/worldEnvironment';
import { CameraController } from './engine/cameraController';
import { PlayController } from './engine/playController';
import { generatePartThumbnails } from './engine/thumbnailGenerator';
import { GameHUD } from './ui/hud';

const CUSTOM_STAMPS_KEY = 'brick_world_3d_custom_stamps_v1';
const MISSIONS_KEY = 'brick_world_3d_missions_v1';

class BrickWorldApp {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private sound = new SoundEngine();
  private world = new WorldState();
  private env: WorldEnvironment;
  private brickRenderer: BrickRenderer;
  private camCtrl: CameraController;
  private playCtrl: PlayController;
  private hud!: GameHUD;

  // Tool & builder state
  private tool: ToolMode = 'build';
  private selectedPartId = 'brick_2x4';
  private selectedColorId = 'red';
  private selectedStampId = BUILTIN_STAMPS[0].id;
  private rotation: Rotation = 0;
  private continuousDraw = false;

  // Pointer interaction state
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private pointerInside = false;
  private isLeftDrawing = false;
  private lastPlacedKey = '';
  private lastHit: RayHit | null = null;
  private lastPlacement: { x: number; y: number; z: number; valid: boolean } | null = null;

  // Touch interaction state (tap vs 1-finger orbit vs 2-finger pinch/pan)
  private activeTouchIds = new Set<number>();
  private touchPrimaryId: number | null = null;
  private touchDownX = 0;
  private touchDownY = 0;
  private touchMoved = false;
  private touchWasMulti = false;
  private touchContinuousActive = false;

  // Custom stamps & Missions
  private customStamps: StampDef[] = [];
  private completedMissions = new Set<string>();
  private usedExplore = false;
  private usedCar = false;
  private usedDynamite = false;
  private usedStamp = false;

  // Timers (performance.now based - zero Three.js deprecation warnings!)
  private lastFrameMs = 0;
  private minimapTimer = 0;
  private autosaveTimer = 0;
  private worldDirty = false;
  private rightDownX = 0;
  private rightDownY = 0;

  constructor() {
    this.container = document.getElementById('canvas-container')!;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      48,
      window.innerWidth / window.innerHeight,
      0.2,
      900
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.container.appendChild(this.renderer.domElement);

    // 100% local procedural studio environment map for crisp glossy ABS plastic!
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    roomEnv.dispose();
    pmrem.dispose();

    this.env = new WorldEnvironment(this.scene);
    this.brickRenderer = new BrickRenderer(this.scene);
    this.camCtrl = new CameraController(this.camera, this.renderer.domElement);
    this.playCtrl = new PlayController(
      this.scene,
      this.camera,
      this.world,
      this.sound,
      this.renderer.domElement
    );

    this.registerDebugGetter();
    this.loadPersistentExtras();
    this.initWorldAndUI();
  }

  private registerDebugGetter() {
    Object.defineProperty(window as unknown as Record<string, unknown>, '__brickDebug', {
      configurable: true,
      enumerable: false,
      get: () => ({
        yaw: this.tool === 'play' ? this.playCtrl.camYaw : this.camCtrl.yaw,
        pitch: this.tool === 'play' ? this.playCtrl.camPitch : this.camCtrl.pitch,
        distance: this.camCtrl.distance,
        brickCount: this.world.getBrickCount(),
        tool: this.tool,
        playerPos: {
          x: this.playCtrl.position.x,
          y: this.playCtrl.position.y,
          z: this.playCtrl.position.z,
        },
      }),
    });
  }

  private loadPersistentExtras() {
    try {
      const mRaw = localStorage.getItem(MISSIONS_KEY);
      if (mRaw) {
        const arr = JSON.parse(mRaw);
        if (Array.isArray(arr)) {
          for (const id of arr) if (typeof id === 'string') this.completedMissions.add(id);
        }
      }
      const sRaw = localStorage.getItem(CUSTOM_STAMPS_KEY);
      if (sRaw) {
        const arr = JSON.parse(sRaw);
        if (Array.isArray(arr)) {
          this.customStamps = arr.filter(
            (s): s is StampDef =>
              s && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.bricks)
          );
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  private saveCustomStamps() {
    try {
      localStorage.setItem(CUSTOM_STAMPS_KEY, JSON.stringify(this.customStamps.slice(0, 12)));
    } catch {
      // ignore
    }
  }

  private initWorldAndUI() {
    const loadingText = document.getElementById('loading-text');
    if (loadingText) loadingText.textContent = 'ブロックの 3Dアイコンを つくっているよ…';

    // Let loading screen paint once, then generate 3D thumbnails & starter world
    requestAnimationFrame(() => {
      const thumbnails = generatePartThumbnails();

      // Load autosave if present, else populate welcoming Starter Village!
      const loaded = this.world.loadAutosave();
      if (!loaded || this.world.getBrickCount() === 0) {
        this.world.theme = 'meadow';
        this.world.timeOfDay = 'day';
        this.world.replaceAllWithStamps(buildStarterWorldBricks(), false);
      }

      this.env.applyTheme(this.world.theme);
      this.env.applyTimeOfDay(this.world.timeOfDay);
      this.brickRenderer.setTimeOfDay(this.world.timeOfDay);
      this.scene.environmentIntensity = this.world.timeOfDay === 'night' ? 0.14 : 0.42;
      this.brickRenderer.rebuildAll(this.world.getAllBricks());
      this.brickRenderer.syncGlowLights(this.camCtrl.target);

      const uiRoot = document.getElementById('ui-root')!;
      this.hud = new GameHUD(uiRoot, thumbnails, {
        onSelectTool: (t) => this.setTool(t),
        onSelectPart: (id) => {
          this.selectedPartId = id;
          if (this.tool !== 'build') this.setTool('build');
          this.sound.playClick(580);
          this.syncHud();
        },
        onSelectColor: (id) => {
          this.selectedColorId = id;
          this.sound.playClick(640);
          this.syncHud();
        },
        onSelectStamp: (id) => {
          this.selectedStampId = id;
          this.sound.playClick(560);
          this.syncHud();
        },
        onCreateCustomStamp: () => this.createCustomStampFromWorld(),
        onRotate: () => this.rotateSelection(),
        onToggleContinuous: () => {
          this.continuousDraw = !this.continuousDraw;
          this.sound.playClick(this.continuousDraw ? 760 : 480);
          this.hud.showToast(
            this.continuousDraw ? '✨ れんぞくおき ON！（ドラッグでならぶよ）' : 'れんぞくおき OFF'
          );
          this.syncHud();
        },
        onUndo: () => this.doUndo(),
        onRedo: () => this.doRedo(),
        onCycleTime: () => {
          const order: TimeOfDay[] = ['morning', 'day', 'sunset', 'night'];
          const next = order[(order.indexOf(this.world.timeOfDay) + 1) % order.length];
          this.setTimeOfDay(next);
        },
        onSelectTime: (t) => this.setTimeOfDay(t),
        onSelectTheme: (th) => this.setTheme(th),
        onToggleMute: () => {
          this.sound.muted = !this.sound.muted;
          if (!this.sound.muted) this.sound.playClick(660);
          this.syncHud();
        },
        onResetWorldStarter: () => {
          this.brickRenderer.cancelSmashImmediate();
          this.world.replaceAllWithStamps(buildStarterWorldBricks(), true);
          this.brickRenderer.rebuildAll(this.world.getAllBricks());
          this.camCtrl.resetView();
          this.sound.playStamp(20);
          this.hud.showToast('🏡 はじめのむらを おいたよ！');
          this.markDirty();
          this.syncHud();
        },
        onClearWorld: () => {
          this.brickRenderer.cancelSmashImmediate();
          this.world.clearAll(true);
          this.brickRenderer.rebuildAll([]);
          this.sound.playDelete();
          this.hud.showToast('🧹 まっさらに したよ！（↩️でもどせるよ）');
          this.markDirty();
          this.syncHud();
        },
        onTakeScreenshot: () => this.takeScreenshot(),
        onSaveSlot: (slot, name) => {
          if (this.world.saveToSlot(slot, name)) {
            this.sound.playFanfare();
            this.hud.showToast(`💾 スロット ${slot} に ほぞんしたよ！`);
          }
        },
        onLoadSlot: (slot) => {
          if (this.world.loadFromSlot(slot)) {
            this.env.applyTheme(this.world.theme);
            this.env.applyTimeOfDay(this.world.timeOfDay);
            this.brickRenderer.setTimeOfDay(this.world.timeOfDay);
            this.brickRenderer.rebuildAll(this.world.getAllBricks());
            this.sound.playStamp(16);
            this.hud.showToast(`📂「${this.world.worldName}」を よみこんだよ！`);
            this.markDirty();
            this.syncHud();
          }
        },
        onExportJson: () => this.exportJsonFile(),
        onImportJson: (file) => this.importJsonFile(file),
        onMinimapClick: (wx, wz) => {
          if (this.tool === 'play') {
            this.playCtrl.enter(wx, wz, this.playCtrl.vehicleMode);
          } else {
            this.camCtrl.focusOn(wx, wz);
          }
          this.sound.playClick(620);
        },
        onCameraZoom: (f) => this.camCtrl.zoomStep(f),
        onCameraRotate: (dy) => this.camCtrl.rotateStep(dy),
        onCameraReset: () => this.camCtrl.resetView(),
        onCameraOverview: () => this.camCtrl.zoomOverview(),
        onRewindSmash: () => {
          this.brickRenderer.startMagicRewind();
          this.sound.playRewind();
          this.hud.showToast('✨ ピタッと もとどおり！');
          setTimeout(() => this.syncHud(), 700);
        },
        onPlayVehicleChange: (mode) => {
          this.playCtrl.setVehicleMode(mode);
          if (mode === 'car') this.usedCar = true;
          this.checkMissions();
          this.syncHud();
        },
        onPlayCameraToggle: () => {
          this.playCtrl.toggleCameraMode();
          this.syncHud();
        },
        onPlayJump: () => this.playCtrl.triggerMobileJump(),
        onVirtualMove: (f, r) => this.playCtrl.setVirtualMove(f, r),
        getSaveSlots: () => this.world.listSaveSlots(),
        getCurrentWorldName: () => this.world.worldName,
        getCompletedMissions: () => this.completedMissions,
      });

      this.bindInteractionEvents();
      this.syncHud();
      this.refreshMinimap();

      // Smoothly hide loading screen
      const loader = document.getElementById('loading-screen');
      if (loader) loader.classList.add('hidden');

      this.lastFrameMs = performance.now();
      this.animate();
    });
  }

  private updatePointerNdc(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private resetTouchState() {
    this.activeTouchIds.clear();
    this.touchPrimaryId = null;
    this.touchMoved = false;
    this.touchWasMulti = false;
    this.touchContinuousActive = false;
    this.isLeftDrawing = false;
    this.lastPlacedKey = '';
  }

  private syncCameraTouchOrbit() {
    const isContinuousTouchBrush =
      this.continuousDraw && (this.tool === 'build' || this.tool === 'paint');
    this.camCtrl.allowSingleTouchOrbit = !isContinuousTouchBrush;
  }

  private executeToolAction() {
    if (this.tool === 'build') {
      this.tryPlaceSingleBrick();
    } else if (this.tool === 'delete') {
      this.tryDeleteHoveredBrick();
    } else if (this.tool === 'paint') {
      this.tryPaintHoveredBrick();
    } else if (this.tool === 'eyedropper') {
      this.tryEyedropHoveredBrick();
    } else if (this.tool === 'stamp') {
      this.tryPlaceCurrentStamp();
    } else if (this.tool === 'dynamite') {
      this.tryTriggerDynamite();
    }
  }

  private bindInteractionEvents() {
    const dom = this.renderer.domElement;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    dom.addEventListener('pointerenter', () => {
      this.pointerInside = true;
    });
    dom.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointerInside = false;
      this.isLeftDrawing = false;
      this.brickRenderer.hideGhost();
      this.brickRenderer.showHoverHighlight(null);
    });

    // Track touch movement on window too so drags gliding over HUD still cancel taps
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !this.activeTouchIds.has(e.pointerId)) return;
      if (this.activeTouchIds.size > 1) {
        this.touchWasMulti = true;
        this.isLeftDrawing = false;
        this.touchContinuousActive = false;
        this.brickRenderer.hideGhost();
        this.brickRenderer.showHoverHighlight(null);
        return;
      }
      if (
        e.pointerId === this.touchPrimaryId &&
        !this.touchMoved &&
        Math.hypot(e.clientX - this.touchDownX, e.clientY - this.touchDownY) >= 10
      ) {
        this.touchMoved = true;
        if (!this.touchContinuousActive) {
          this.brickRenderer.hideGhost();
          this.brickRenderer.showHoverHighlight(null);
        }
      }
    });

    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') {
        if (this.tool === 'play' || !this.activeTouchIds.has(e.pointerId)) return;
        if (this.activeTouchIds.size > 1) {
          this.touchWasMulti = true;
          this.isLeftDrawing = false;
          this.touchContinuousActive = false;
          return;
        }
        if (
          e.pointerId === this.touchPrimaryId &&
          !this.touchMoved &&
          Math.hypot(e.clientX - this.touchDownX, e.clientY - this.touchDownY) >= 10
        ) {
          this.touchMoved = true;
          if (!this.touchContinuousActive) {
            this.brickRenderer.hideGhost();
            this.brickRenderer.showHoverHighlight(null);
          }
        }
        if (
          this.continuousDraw &&
          !this.touchWasMulti &&
          this.activeTouchIds.size === 1 &&
          (this.tool === 'build' || this.tool === 'paint')
        ) {
          this.updatePointerNdc(e.clientX, e.clientY);
          this.pointerInside = true;
          this.updateHoverAndGhost();
          if (this.tool === 'build') {
            this.tryPlaceSingleBrick();
          } else if (this.tool === 'paint') {
            this.tryPaintHoveredBrick();
          }
        }
        return;
      }

      this.updatePointerNdc(e.clientX, e.clientY);
      this.pointerInside = true;

      if (this.tool === 'play') return;
      this.updateHoverAndGhost();

      // Continuous brush drag building or painting!
      if (this.isLeftDrawing && (this.continuousDraw || e.shiftKey || this.tool === 'paint')) {
        if (this.tool === 'build') {
          this.tryPlaceSingleBrick();
        } else if (this.tool === 'paint') {
          this.tryPaintHoveredBrick();
        }
      }
    });

    dom.addEventListener('pointerdown', (e) => {
      if (this.tool === 'play') return;

      if (e.pointerType === 'touch') {
        this.activeTouchIds.add(e.pointerId);

        if (this.activeTouchIds.size > 1) {
          this.touchWasMulti = true;
          this.isLeftDrawing = false;
          this.touchContinuousActive = false;
          this.brickRenderer.hideGhost();
          this.brickRenderer.showHoverHighlight(null);
          return;
        }

        this.touchPrimaryId = e.pointerId;
        this.touchDownX = e.clientX;
        this.touchDownY = e.clientY;
        this.touchMoved = false;
        this.touchWasMulti = false;
        this.touchContinuousActive = false;

        this.updatePointerNdc(e.clientX, e.clientY);
        this.pointerInside = true;

        const isContinuousTool =
          this.continuousDraw && (this.tool === 'build' || this.tool === 'paint');
        if (isContinuousTool) {
          this.updateHoverAndGhost();
          this.isLeftDrawing = true;
          this.touchContinuousActive = true;
          this.lastPlacedKey = '';
          if (this.tool === 'build') {
            this.tryPlaceSingleBrick();
          } else if (this.tool === 'paint') {
            this.tryPaintHoveredBrick();
          }
        } else if (this.tool === 'build' || this.tool === 'stamp') {
          this.updateHoverAndGhost();
        }
        return;
      }

      if (e.button === 2) {
        this.rightDownX = e.clientX;
        this.rightDownY = e.clientY;
        return;
      }
      if (e.button !== 0 || e.altKey) return; // Right/Alt drag is camera orbit

      this.updatePointerNdc(e.clientX, e.clientY);
      this.pointerInside = true;
      this.updateHoverAndGhost();

      this.isLeftDrawing = true;
      this.lastPlacedKey = '';
      this.executeToolAction();
    });

    dom.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') {
        if (this.tool !== 'play' && this.activeTouchIds.has(e.pointerId)) {
          const isContinuousTool =
            this.continuousDraw && (this.tool === 'build' || this.tool === 'paint');
          if (
            !this.touchMoved &&
            !this.touchWasMulti &&
            e.pointerId === this.touchPrimaryId &&
            !isContinuousTool &&
            !this.touchContinuousActive
          ) {
            this.updatePointerNdc(e.clientX, e.clientY);
            this.pointerInside = true;
            this.updateHoverAndGhost();
            this.lastPlacedKey = '';
            this.executeToolAction();
          }
        }
        this.activeTouchIds.delete(e.pointerId);
        if (this.activeTouchIds.size === 0) {
          this.resetTouchState();
          this.brickRenderer.hideGhost();
          this.brickRenderer.showHoverHighlight(null);
        } else if (e.pointerId === this.touchPrimaryId) {
          this.touchPrimaryId = null;
        }
        return;
      }

      // Quick right-click tap (no drag) in Build mode deletes the pointed brick!
      if (this.tool === 'build' && e.button === 2) {
        const moveDist = Math.hypot(e.clientX - this.rightDownX, e.clientY - this.rightDownY);
        if (moveDist < 4) {
          this.updatePointerNdc(e.clientX, e.clientY);
          this.updateHoverAndGhost();
          this.tryDeleteHoveredBrick();
        }
      }
    });

    const endWindowPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (!this.activeTouchIds.has(e.pointerId)) return;
        this.activeTouchIds.delete(e.pointerId);
        if (this.activeTouchIds.size === 0) {
          this.resetTouchState();
          this.brickRenderer.hideGhost();
          this.brickRenderer.showHoverHighlight(null);
        } else if (e.pointerId === this.touchPrimaryId) {
          this.touchPrimaryId = null;
        }
        return;
      }
      this.isLeftDrawing = false;
      this.lastPlacedKey = '';
    };
    window.addEventListener('pointerup', endWindowPointer);
    window.addEventListener('pointercancel', endWindowPointer);
    window.addEventListener('blur', () => {
      this.resetTouchState();
    });

    // Keyboard shortcuts!
    window.addEventListener('keydown', (e) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) this.doRedo();
        else this.doUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        this.doRedo();
        return;
      }

      if (e.code === 'KeyR' && this.tool !== 'play') {
        this.rotateSelection();
      } else if (e.code === 'Escape') {
        if (this.tool === 'play') this.setTool('build');
        this.hud.closeModal();
      } else if (e.code === 'Digit1') {
        this.setTool('build');
      } else if (e.code === 'Digit2') {
        this.setTool('delete');
      } else if (e.code === 'Digit3') {
        this.setTool('paint');
      } else if (e.code === 'Digit4') {
        this.setTool('eyedropper');
      } else if (e.code === 'Digit5') {
        this.setTool('stamp');
      } else if (e.code === 'Digit6') {
        this.setTool('dynamite');
      } else if (e.code === 'Digit7') {
        this.setTool('play');
      }
    });
  }

  private setTool(nextTool: ToolMode) {
    if (this.tool === nextTool) {
      if (nextTool === 'play') {
        this.setTool('build');
      }
      return;
    }

    // Restore bricks neatly if leaving dynamite mode
    if (this.tool === 'dynamite' && this.brickRenderer.isSmashed()) {
      this.brickRenderer.startMagicRewind();
      this.sound.playRewind();
    }

    // Exiting play mode -> focus builder camera right where player stood!
    if (this.tool === 'play' && nextTool !== 'play') {
      const px = this.playCtrl.position.x;
      const pz = this.playCtrl.position.z;
      this.playCtrl.exit();
      this.camCtrl.enabled = true;
      this.camCtrl.focusOn(px, pz, 28);
    }

    this.tool = nextTool;
    this.resetTouchState();
    this.brickRenderer.hideGhost();
    this.brickRenderer.showHoverHighlight(null);

    if (nextTool === 'play') {
      this.camCtrl.enabled = false;
      this.playCtrl.enter(this.camCtrl.target.x, this.camCtrl.target.z, this.playCtrl.vehicleMode);
      this.playCtrl.setNightMode(this.world.timeOfDay === 'night');
      this.usedExplore = true;
      if (this.playCtrl.vehicleMode === 'car') this.usedCar = true;
      this.sound.playJump();
      this.checkMissions();
    } else {
      this.sound.playClick(600);
    }

    this.syncHud();
  }

  private rotateSelection() {
    this.rotation = ((this.rotation + 1) % 4) as Rotation;
    this.sound.playClick(740);
    this.updateHoverAndGhost();
  }

  private setTimeOfDay(time: TimeOfDay) {
    this.world.timeOfDay = time;
    this.env.applyTimeOfDay(time);
    this.brickRenderer.setTimeOfDay(time);
    this.scene.environmentIntensity =
      time === 'night' ? 0.14 : time === 'sunset' ? 0.3 : 0.42;
    this.brickRenderer.syncGlowLights(
      this.tool === 'play' ? this.playCtrl.position : this.camCtrl.target
    );
    this.playCtrl.setNightMode(time === 'night');
    this.sound.playClick(time === 'night' ? 420 : 680);
    this.markDirty();
    this.checkMissions();
    this.syncHud();
  }

  private setTheme(theme: WorldTheme) {
    this.world.theme = theme;
    this.env.applyTheme(theme);
    this.sound.playStamp(8);
    this.markDirty();
    this.refreshMinimap();
    this.syncHud();
  }

  private getCurrentStamp(): StampDef {
    return (
      this.customStamps.find((s) => s.id === this.selectedStampId) ??
      BUILTIN_STAMPS.find((s) => s.id === this.selectedStampId) ??
      BUILTIN_STAMPS[0]
    );
  }

  private computeStampPlacement(
    hit: RayHit,
    stamp: StampDef
  ): { ox: number; oy: number; oz: number; valid: boolean; items: Array<{ partId: string; colorId: string; x: number; y: number; z: number; rot: Rotation }> } {
    // Compute rotated bounds of stamp
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
    const rotated = stamp.bricks.map((sb) => {
      const totalRot = ((sb.rot + this.rotation) % 4) as Rotation;
      const [rdx, rdz] = this.brickRenderer.rotateStampOffset(
        sb.dx,
        sb.dz,
        sb.partId,
        sb.rot,
        this.rotation
      );
      const def = getPartDef(sb.partId);
      const [rx, ry, rz] = getRotatedSize(def.sx, def.sy, def.sz, totalRot);
      minX = Math.min(minX, rdx);
      maxX = Math.max(maxX, rdx + rx);
      minZ = Math.min(minZ, rdz);
      maxZ = Math.max(maxZ, rdz + rz);
      maxY = Math.max(maxY, sb.dy + ry);
      return { sb, rdx, rdz, totalRot };
    });

    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    let ox = Math.round(hit.pointX - spanX * 0.5) - minX;
    let oz = Math.round(hit.pointZ - spanZ * 0.5) - minZ;
    let oy = hit.type === 'ground' ? 0 : hit.normalY > 0 ? hit.cellY + 1 : 0;

    // Clamp entire stamp inside 128x128x96 world
    ox = Math.max(-minX, Math.min(WORLD_SIZE - maxX, ox));
    oz = Math.max(-minZ, Math.min(WORLD_SIZE - maxZ, oz));
    oy = Math.max(0, Math.min(MAX_HEIGHT - maxY, oy));

    const items = rotated.map(({ sb, rdx, rdz, totalRot }) => ({
      partId: sb.partId,
      colorId: sb.colorId,
      x: ox + rdx,
      y: oy + sb.dy,
      z: oz + rdz,
      rot: totalRot,
    }));

    // Stamp is valid if at least 70% of bricks don't collide (usually 100%)
    let validCount = 0;
    for (const it of items) {
      if (this.world.canPlace(it.partId, it.x, it.y, it.z, it.rot)) {
        validCount++;
      }
    }
    const valid = items.length > 0 && validCount === items.length;
    return { ox, oy, oz, valid, items };
  }

  private updateHoverAndGhost() {
    if (!this.pointerInside || this.tool === 'play') return;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.world.raycast(this.raycaster.ray.origin, this.raycaster.ray.direction);
    this.lastHit = hit;

    if (!hit) {
      this.brickRenderer.hideGhost();
      this.brickRenderer.showHoverHighlight(null);
      this.lastPlacement = null;
      return;
    }

    if (this.tool === 'build') {
      this.brickRenderer.showHoverHighlight(null);
      const p = this.world.computePlacement(hit, this.selectedPartId, this.rotation);
      this.lastPlacement = p;
      this.brickRenderer.updateSingleGhost(
        this.selectedPartId,
        this.selectedColorId,
        p.x,
        p.y,
        p.z,
        this.rotation,
        p.valid
      );
    } else if (this.tool === 'stamp') {
      this.brickRenderer.showHoverHighlight(null);
      const stamp = this.getCurrentStamp();
      const sp = this.computeStampPlacement(hit, stamp);
      this.brickRenderer.updateStampGhost(
        stamp.id,
        stamp.bricks,
        sp.ox,
        sp.oy,
        sp.oz,
        this.rotation,
        sp.valid
      );
    } else if (this.tool === 'delete' || this.tool === 'paint' || this.tool === 'eyedropper') {
      this.brickRenderer.hideGhost();
      const brick = hit.type === 'brick' && hit.brickId ? this.world.getBrick(hit.brickId) ?? null : null;
      const outlineColor =
        this.tool === 'delete' ? 0xff3355 : this.tool === 'paint' ? 0x38bdf8 : 0xfacc15;
      this.brickRenderer.showHoverHighlight(brick, outlineColor);
    } else if (this.tool === 'dynamite') {
      this.brickRenderer.hideGhost();
      const brick = hit.type === 'brick' && hit.brickId ? this.world.getBrick(hit.brickId) ?? null : null;
      this.brickRenderer.showHoverHighlight(brick, 0xff6d00);
    }
  }

  private tryPlaceSingleBrick() {
    if (!this.lastPlacement || !this.lastPlacement.valid) return;
    const { x, y, z } = this.lastPlacement;
    const key = `${x},${y},${z}`;
    if (key === this.lastPlacedKey) return;

    const brick = this.world.addBrick(
      this.selectedPartId,
      this.selectedColorId,
      x,
      y,
      z,
      this.rotation,
      true
    );
    if (brick) {
      this.lastPlacedKey = key;
      this.brickRenderer.addBrick(brick, true);
      const def = getPartDef(brick.partId);
      this.sound.playPlace(1, def.sx * def.sz);
      this.markDirty();
      this.checkMissions();
      this.syncHud();
      this.updateHoverAndGhost();
    }
  }

  private tryDeleteHoveredBrick() {
    if (!this.lastHit || this.lastHit.type !== 'brick' || !this.lastHit.brickId) return;
    const removed = this.world.removeBrick(this.lastHit.brickId, true);
    if (removed) {
      this.brickRenderer.removeBrick(removed.id, true);
      this.sound.playDelete();
      this.markDirty();
      this.syncHud();
      this.updateHoverAndGhost();
    }
  }

  private tryPaintHoveredBrick() {
    if (!this.lastHit || this.lastHit.type !== 'brick' || !this.lastHit.brickId) return;
    const updated = this.world.recolorBrick(this.lastHit.brickId, this.selectedColorId, true);
    if (updated) {
      this.brickRenderer.updateBrickColor(updated);
      this.sound.playPaint();
      this.markDirty();
      this.checkMissions();
      this.syncHud();
    }
  }

  private tryEyedropHoveredBrick() {
    if (!this.lastHit || this.lastHit.type !== 'brick' || !this.lastHit.brickId) return;
    const brick = this.world.getBrick(this.lastHit.brickId);
    if (!brick) return;
    this.selectedPartId = brick.partId;
    this.selectedColorId = brick.colorId;
    this.rotation = brick.rot;
    this.sound.playClick(840);
    this.hud.showToast(`💧「${getPartDef(brick.partId).name}」を コピーしたよ！`);
    this.setTool('build');
  }

  private tryPlaceCurrentStamp() {
    if (!this.lastHit) return;
    const stamp = this.getCurrentStamp();
    const sp = this.computeStampPlacement(this.lastHit, stamp);
    if (!sp.valid) {
      this.sound.playClick(240);
      this.hud.showToast('ここには ほかのブロックが あるみたい！ひろいばしょに おいてね');
      return;
    }
    const added = this.world.addBricksBatch(sp.items, true);
    if (added.length > 0) {
      for (const b of added) {
        this.brickRenderer.addBrick(b, true);
      }
      this.sound.playStamp(added.length);
      this.usedStamp = true;
      this.markDirty();
      this.checkMissions();
      this.syncHud();
      // Hide stamp ghost right after placement so kids can immediately admire their build!
      this.brickRenderer.hideGhost();
    }
  }

  private tryTriggerDynamite() {
    if (!this.lastHit) return;
    const center = new THREE.Vector3(this.lastHit.pointX, this.lastHit.pointY, this.lastHit.pointZ);
    const affected = this.brickRenderer.triggerDynamiteExplosion(center, 15);
    this.sound.playBoom();
    if (affected > 0) {
      this.usedDynamite = true;
      this.syncHud();
    }
  }

  private createCustomStampFromWorld() {
    const all = this.world.getAllBricks();
    if (all.length === 0) {
      this.hud.showToast('まずは ブロックを おいてから はんこにしてね！');
      return;
    }
    if (all.length > 260) {
      this.hud.showToast('はんこに できるのは 260こ までだよ！（ちいさめの作品で つくってね）');
      return;
    }
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    for (const b of all) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.z < minZ) minZ = b.z;
    }
    const bricks: StampBrick[] = all.map((b) => ({
      partId: b.partId,
      colorId: b.colorId,
      dx: b.x - minX,
      dy: b.y - minY,
      dz: b.z - minZ,
      rot: b.rot,
    }));
    const idx = this.customStamps.length + 1;
    const stamp: StampDef = {
      id: `custom_${Date.now()}`,
      name: `マイはんこ ${idx}`,
      emoji: '⭐',
      category: 'custom',
      description: 'じぶんで つくった オリジナル はんこ！',
      bricks,
    };
    this.customStamps.unshift(stamp);
    this.selectedStampId = stamp.id;
    this.saveCustomStamps();
    this.sound.playFanfare();
    this.hud.showToast(`⭐「${stamp.name}」を つくったよ！`);
    this.syncHud();
  }

  private doUndo() {
    if (this.brickRenderer.isSmashed()) {
      this.brickRenderer.startMagicRewind();
      this.sound.playRewind();
      return;
    }
    const diff = this.world.undo();
    if (!diff) return;
    for (const b of diff.removed) this.brickRenderer.removeBrick(b.id, false);
    for (const b of diff.added) this.brickRenderer.addBrick(b, false);
    for (const b of diff.recolored) this.brickRenderer.updateBrickColor(b);
    this.sound.playClick(420);
    this.markDirty();
    this.syncHud();
  }

  private doRedo() {
    const diff = this.world.redo();
    if (!diff) return;
    for (const b of diff.removed) this.brickRenderer.removeBrick(b.id, false);
    for (const b of diff.added) this.brickRenderer.addBrick(b, false);
    for (const b of diff.recolored) this.brickRenderer.updateBrickColor(b);
    this.sound.playClick(620);
    this.markDirty();
    this.syncHud();
  }

  private checkMissions() {
    const ctx = {
      bricks: this.world.getAllBricks(),
      timeOfDay: this.world.timeOfDay,
      usedExplore: this.usedExplore,
      usedCar: this.usedCar,
      usedDynamite: this.usedDynamite,
      usedStamp: this.usedStamp,
    };
    let newlyDone = false;
    for (const m of MISSIONS) {
      if (this.completedMissions.has(m.id)) continue;
      if (m.check(ctx)) {
        this.completedMissions.add(m.id);
        newlyDone = true;
        this.sound.playFanfare();
        this.hud.showToast(`🎉 おだいクリア！「${m.icon} ${m.title}」`, true);
        const confettiCenter =
          this.tool === 'play' ? this.playCtrl.position : this.camCtrl.target;
        this.brickRenderer.spawnCelebrationConfetti(confettiCenter);
      }
    }
    if (newlyDone) {
      try {
        localStorage.setItem(MISSIONS_KEY, JSON.stringify(Array.from(this.completedMissions)));
      } catch {
        // ignore
      }
    }
  }

  private takeScreenshot() {
    this.brickRenderer.hideGhost();
    this.brickRenderer.showHoverHighlight(null);
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `brick-world-3d-${Date.now()}.png`;
    a.click();
    this.sound.playClick(880);
    this.hud.showToast('📷 すてきな しゃしんを ほぞんしたよ！');
  }

  private exportJsonFile() {
    const json = JSON.stringify(this.world.exportSaveData(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brick-world-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.sound.playClick(740);
    this.hud.showToast('💾 ワールドファイルを ほぞんしたよ！');
  }

  private importJsonFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (this.world.importSaveData(parsed)) {
          this.env.applyTheme(this.world.theme);
          this.env.applyTimeOfDay(this.world.timeOfDay);
          this.brickRenderer.setTimeOfDay(this.world.timeOfDay);
          this.brickRenderer.rebuildAll(this.world.getAllBricks());
          this.sound.playFanfare();
          this.hud.showToast(`📂「${this.world.worldName}」を ひらいたよ！`);
          this.markDirty();
          this.syncHud();
        } else {
          this.hud.showToast('このファイルは よみこめなかったよ');
        }
      } catch {
        this.hud.showToast('ファイルの かたちが ちがうみたい！');
      }
    };
    reader.readAsText(file);
  }

  private markDirty() {
    this.worldDirty = true;
    this.autosaveTimer = 0;
  }

  private refreshMinimap() {
    const focusX = this.tool === 'play' ? this.playCtrl.position.x : this.camCtrl.target.x;
    const focusZ = this.tool === 'play' ? this.playCtrl.position.z : this.camCtrl.target.z;
    this.hud.updateMinimap(this.world.theme, this.world.getAllBricks(), focusX, focusZ);
  }

  private syncHud() {
    this.syncCameraTouchOrbit();
    this.hud.syncState({
      tool: this.tool,
      partId: this.selectedPartId,
      colorId: this.selectedColorId,
      stampId: this.selectedStampId,
      continuous: this.continuousDraw,
      canUndo: this.world.canUndo(),
      canRedo: this.world.canRedo(),
      brickCount: this.world.getBrickCount(),
      timeOfDay: this.world.timeOfDay,
      theme: this.world.theme,
      muted: this.sound.muted,
      playVehicle: this.playCtrl.vehicleMode,
      playCamera: this.playCtrl.cameraMode,
      isSmashed: this.brickRenderer.isSmashed(),
      customStamps: this.customStamps,
      completedMissionCount: this.completedMissions.size,
    });
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameMs) / 1000));
    this.lastFrameMs = now;

    if (this.tool === 'play') {
      this.playCtrl.update(dt);
    } else {
      this.camCtrl.update(dt);
    }

    this.env.update(dt);
    this.brickRenderer.update(dt);
    this.renderer.render(this.scene, this.camera);

    // Periodic lightweight minimap & dynamic night light refresh
    this.minimapTimer += dt;
    if (this.minimapTimer >= 0.22) {
      this.minimapTimer = 0;
      this.refreshMinimap();
      this.brickRenderer.syncGlowLights(
        this.tool === 'play' ? this.playCtrl.position : this.camCtrl.target
      );
    }

    // Debounced local autosave
    if (this.worldDirty) {
      this.autosaveTimer += dt;
      if (this.autosaveTimer >= 1.5) {
        this.world.autosave();
        this.worldDirty = false;
      }
    }
  };
}

new BrickWorldApp();
