import { COLORS, getColorDef } from '../data/colors';
import { MISSIONS } from '../data/missions';
import { PART_CATEGORIES, PARTS } from '../data/parts';
import { BUILTIN_STAMPS } from '../data/stamps';
import { WORLD_SIZE } from '../types';
import type {
  PartCategory,
  PlayCameraMode,
  PlayVehicleMode,
  StampDef,
  TimeOfDay,
  ToolMode,
  WorldTheme,
} from '../types';
import type { SaveSlotSummary } from '../engine/worldState';

export interface HudCallbacks {
  onSelectTool: (tool: ToolMode) => void;
  onSelectPart: (partId: string) => void;
  onSelectColor: (colorId: string) => void;
  onSelectStamp: (stampId: string) => void;
  onCreateCustomStamp: () => void;
  onRotate: () => void;
  onToggleContinuous: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCycleTime: () => void;
  onSelectTime: (time: TimeOfDay) => void;
  onSelectTheme: (theme: WorldTheme) => void;
  onToggleMute: () => void;
  onResetWorldStarter: () => void;
  onClearWorld: () => void;
  onTakeScreenshot: () => void;
  onSaveSlot: (slot: number, name: string) => void;
  onLoadSlot: (slot: number) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onMinimapClick: (wx: number, wz: number) => void;
  onCameraZoom: (factor: number) => void;
  onCameraRotate: (deltaYaw: number) => void;
  onCameraReset: () => void;
  onCameraOverview: () => void;
  onRewindSmash: () => void;
  onPlayVehicleChange: (mode: PlayVehicleMode) => void;
  onPlayCameraToggle: () => void;
  onPlayJump: () => void;
  onVirtualMove?: (forward: number, right: number) => void;
  getSaveSlots: () => SaveSlotSummary[];
  getCurrentWorldName: () => string;
  getCompletedMissions: () => Set<string>;
}

const TIME_LABELS: Record<TimeOfDay, { icon: string; label: string }> = {
  morning: { icon: '🌅', label: 'あさ' },
  day: { icon: '☀️', label: 'ひる' },
  sunset: { icon: '🌇', label: 'ゆうがた' },
  night: { icon: '🌙', label: 'よる' },
};

const THEME_INFOS: Array<{ id: WorldTheme; emoji: string; name: string; desc: string }> = [
  { id: 'meadow', emoji: '🌿', name: 'みどりのはらっぱ', desc: 'ひろい 芝生で なんでも つくれる！' },
  { id: 'city', emoji: '🛣️', name: 'まちのどうろ', desc: 'どうろつき！いえや くるまを ならべよう' },
  { id: 'island', emoji: '🏝️', name: 'うみとしま', desc: 'すなはまと キラキラの うみの しま！' },
  { id: 'space', emoji: '🌌', name: 'うちゅうきち', desc: 'ほしぞらと ちきゅうが みえる 月面！' },
];

export class GameHUD {
  private root: HTMLElement;
  private cb: HudCallbacks;
  private thumbnails: Map<string, string>;

  private currentTool: ToolMode = 'build';
  private currentCategory: PartCategory = 'basic';
  private currentPartId = 'brick_2x4';
  private currentColorId = 'red';
  private currentStampId = BUILTIN_STAMPS[0].id;
  private customStamps: StampDef[] = [];
  private continuousDraw = false;
  private dockCollapsed = false;
  private muted = false;
  private currentTime: TimeOfDay = 'day';
  private currentTheme: WorldTheme = 'meadow';
  private playVehicle: PlayVehicleMode = 'walk';
  private playCamera: PlayCameraMode = 'third';
  private isSmashed = false;

  // Element refs
  private brickCountEl!: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private contBtn!: HTMLButtonElement;
  private timeBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private missionCountEl!: HTMLElement;
  private toolBtns = new Map<ToolMode, HTMLButtonElement>();
  private dockContainer!: HTMLElement;
  private quickHintEl!: HTMLElement;
  private toastContainer!: HTMLElement;
  private minimapCanvas!: HTMLCanvasElement;
  private rightCornerEl!: HTMLElement;
  private minimapToggleBtn!: HTMLButtonElement;
  private minimapMobileOpen = false;
  private touchPlayControlsEl!: HTMLElement;
  private joystickBaseEl!: HTMLElement;
  private joystickKnobEl!: HTMLElement;
  private touchActionBtn!: HTMLButtonElement;
  private touchActionIconEl!: HTMLElement;
  private touchActionLabelEl!: HTMLElement;
  private joystickPointerId: number | null = null;
  private modalBackdrop!: HTMLElement;
  private modalCard!: HTMLElement;
  private activeModal: 'none' | 'world' | 'missions' | 'help' = 'none';

  constructor(root: HTMLElement, thumbnails: Map<string, string>, cb: HudCallbacks) {
    this.root = root;
    this.thumbnails = thumbnails;
    this.cb = cb;

    this.buildShell();
    this.renderDock();

    const onViewportChange = () => {
      this.syncTouchPlayControls();
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    window.addEventListener('blur', () => {
      if (this.joystickPointerId !== null) this.resetJoystick();
    });
  }

  private el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  private buildShell() {
    this.root.innerHTML = '';

    // 1) Top Area (flow container guarantees zero overlap between top bar, hint & toasts!)
    const topArea = this.el('div', 'top-area');
    const topBar = this.el('div', 'top-bar');

    // Brand + Brick counter
    const brand = this.el('div', 'brand-pill pointer-on');
    brand.append(
      this.el('span', 'btn-icon', '🧱'),
      this.el('span', 'brand-title', 'ブロックワールド 3D')
    );
    this.brickCountEl = this.el('span', 'brick-counter', '0こ');
    brand.append(this.brickCountEl);
    topBar.append(brand);

    // Main Tool Group
    const toolGroup = this.el('div', 'bar-group tool-group pointer-on');
    const tools: Array<{ id: ToolMode; icon: string; label: string; extraClass?: string }> = [
      { id: 'build', icon: '🧱', label: 'おく' },
      { id: 'delete', icon: '🔨', label: 'けす', extraClass: 'btn-danger' },
      { id: 'paint', icon: '🎨', label: 'ぬる' },
      { id: 'eyedropper', icon: '💧', label: 'コピー' },
      { id: 'stamp', icon: '🏗️', label: 'はんこ' },
      { id: 'dynamite', icon: '💣', label: 'ドカーン', extraClass: 'btn-boom' },
      { id: 'play', icon: '🚶', label: 'あそぶ！', extraClass: 'btn-play' },
    ];
    for (const t of tools) {
      const btn = this.el('button', `btn ${t.extraClass ?? ''}`.trim());
      btn.type = 'button';
      btn.append(this.el('span', 'btn-icon', t.icon), this.el('span', '', t.label));
      btn.addEventListener('click', () => this.cb.onSelectTool(t.id));
      this.toolBtns.set(t.id, btn);
      toolGroup.append(btn);
    }
    topBar.append(toolGroup);

    // Quick Action Group
    const actionGroup = this.el('div', 'bar-group action-group pointer-on');

    this.undoBtn = this.el('button', 'btn btn-small');
    this.undoBtn.title = 'ひとつ もどす (Ctrl+Z)';
    this.undoBtn.append(this.el('span', 'btn-icon', '↩️'));
    this.undoBtn.addEventListener('click', () => this.cb.onUndo());

    this.redoBtn = this.el('button', 'btn btn-small');
    this.redoBtn.title = 'やりなおす (Ctrl+Y)';
    this.redoBtn.append(this.el('span', 'btn-icon', '↪️'));
    this.redoBtn.addEventListener('click', () => this.cb.onRedo());

    const rotateBtn = this.el('button', 'btn btn-small');
    rotateBtn.title = 'くるっと まわす (Rキー)';
    rotateBtn.append(this.el('span', 'btn-icon', '🔄'), this.el('span', '', 'まわす'));
    rotateBtn.addEventListener('click', () => this.cb.onRotate());

    this.contBtn = this.el('button', 'btn btn-small');
    this.contBtn.title = 'ドラッグで れんぞくおき';
    this.contBtn.append(this.el('span', 'btn-icon', '✨'), this.el('span', '', 'れんぞく'));
    this.contBtn.addEventListener('click', () => this.cb.onToggleContinuous());

    this.timeBtn = this.el('button', 'btn btn-small');
    this.timeBtn.title = 'あさ・ひる・ゆうがた・よる を きりかえ';
    this.timeBtn.addEventListener('click', () => this.cb.onCycleTime());

    const missionBtn = this.el('button', 'btn btn-small');
    missionBtn.title = 'おだいチャレンジ';
    this.missionCountEl = this.el('span', '', '⭐0/' + MISSIONS.length);
    missionBtn.append(this.missionCountEl);
    missionBtn.addEventListener('click', () => this.openModal('missions'));

    const worldBtn = this.el('button', 'btn btn-small');
    worldBtn.title = 'ちけい・セーブ・しゃしん';
    worldBtn.append(this.el('span', 'btn-icon', '🌍'), this.el('span', '', 'メニュー'));
    worldBtn.addEventListener('click', () => this.openModal('world'));

    this.muteBtn = this.el('button', 'btn btn-small');
    this.muteBtn.title = 'おと ON / OFF';
    this.muteBtn.textContent = '🔊';
    this.muteBtn.addEventListener('click', () => this.cb.onToggleMute());

    const helpBtn = this.el('button', 'btn btn-small', '❓');
    helpBtn.title = 'あそびかた';
    helpBtn.addEventListener('click', () => this.openModal('help'));

    actionGroup.append(
      this.undoBtn,
      this.redoBtn,
      worldBtn,
      rotateBtn,
      this.timeBtn,
      this.contBtn,
      missionBtn,
      this.muteBtn,
      helpBtn
    );
    topBar.append(actionGroup);
    topArea.append(topBar);

    // 2) Subtle helpful floating hint (directly below top bar, never overlapping!)
    this.quickHintEl = this.el('div', 'quick-hint');
    topArea.append(this.quickHintEl);

    // 3) Toast Container (centered directly below hint/top bar)
    this.toastContainer = this.el('div', 'toast-container');
    topArea.append(this.toastContainer);

    this.root.append(topArea);

    // 4) Bottom Dock
    this.dockContainer = this.el('div', 'bottom-dock pointer-on');
    this.root.append(this.dockContainer);

    // 5) Right Corner: Mobile Toggle + Camera buttons + Giant 128x128 Minimap
    this.rightCornerEl = this.el('div', 'right-corner pointer-on');

    this.minimapToggleBtn = this.el('button', 'minimap-toggle-btn', '🗺️');
    this.minimapToggleBtn.type = 'button';
    this.minimapToggleBtn.title = 'マップ・カメラを ひらく / とじる';
    this.minimapToggleBtn.setAttribute('aria-label', 'マップ・カメラを ひらく / とじる');
    this.minimapToggleBtn.addEventListener('click', () => {
      this.minimapMobileOpen = !this.minimapMobileOpen;
      this.syncRightCornerState();
    });
    this.rightCornerEl.append(this.minimapToggleBtn);

    const camPad = this.el('div', 'cam-pad');
    const makeCamBtn = (text: string, title: string, onClick: () => void) => {
      const b = this.el('button', 'cam-btn', text);
      b.type = 'button';
      b.title = title;
      b.addEventListener('click', onClick);
      return b;
    };
    camPad.append(
      makeCamBtn('↺', 'ひだりに まわす', () => this.cb.onCameraRotate(-0.5)),
      makeCamBtn('↻', 'みぎに まわす', () => this.cb.onCameraRotate(0.5)),
      makeCamBtn('＋', 'ちかづく', () => this.cb.onCameraZoom(0.76)),
      makeCamBtn('－', 'とおざかる', () => this.cb.onCameraZoom(1.3)),
      makeCamBtn('🌐', 'せかい ぜんたいを みる', () => this.cb.onCameraOverview()),
      makeCamBtn('🏠', 'まん中に もどる', () => this.cb.onCameraReset())
    );
    this.rightCornerEl.append(camPad);

    const mmWrap = this.el('div', 'minimap-wrap');
    const mmTitle = this.el('div', 'minimap-title');
    mmTitle.append(
      document.createTextNode('🗺️ 128×128 マップ'),
      this.el('span', 'minimap-title-sub', '（クリックでいどう）')
    );
    mmWrap.append(mmTitle);
    this.minimapCanvas = this.el('canvas');
    this.minimapCanvas.id = 'minimap-canvas';
    this.minimapCanvas.width = 128;
    this.minimapCanvas.height = 128;
    this.minimapCanvas.addEventListener('click', (e) => {
      const rect = this.minimapCanvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * WORLD_SIZE;
      const nz = ((e.clientY - rect.top) / rect.height) * WORLD_SIZE;
      this.cb.onMinimapClick(nx, nz);
    });
    mmWrap.append(this.minimapCanvas);
    this.rightCornerEl.append(mmWrap);
    this.root.append(this.rightCornerEl);

    // 6) Touch / Mobile Play Controls (Virtual Joystick + Big Jump/Horn Button)
    this.buildTouchPlayControls();
    this.root.append(this.touchPlayControlsEl);

    // 7) Modal Backdrop
    this.modalBackdrop = this.el('div', 'modal-backdrop hidden pointer-on');
    this.modalCard = this.el('div', 'modal-card');
    this.modalBackdrop.append(this.modalCard);
    this.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeModal();
    });
    this.root.append(this.modalBackdrop);

    this.syncRightCornerState();
    this.syncTopBarState();
    this.syncTouchPlayControls();
  }

  private syncRightCornerState() {
    const collapsed = !this.minimapMobileOpen;
    this.rightCornerEl.classList.toggle('mobile-collapsed', collapsed);
    this.root.classList.toggle('minimap-open-mobile', !collapsed);
    this.minimapToggleBtn.textContent = collapsed ? '🗺️' : '🗺️ ✖';
    this.minimapToggleBtn.classList.toggle('open', !collapsed);
    this.minimapToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  }

  private buildTouchPlayControls() {
    this.touchPlayControlsEl = this.el('div', 'touch-play-controls hidden');

    // Left: Virtual Joystick
    this.joystickBaseEl = this.el('div', 'virtual-joystick pointer-on');
    this.joystickBaseEl.setAttribute('role', 'application');
    this.joystickBaseEl.setAttribute('aria-label', 'いどう パッド');

    const arrows: Array<[string, string]> = [
      ['vj-dir vj-up', '▲'],
      ['vj-dir vj-down', '▼'],
      ['vj-dir vj-left', '◀'],
      ['vj-dir vj-right', '▶'],
    ];
    for (const [cls, symbol] of arrows) {
      const a = this.el('span', cls, symbol);
      a.setAttribute('aria-hidden', 'true');
      this.joystickBaseEl.append(a);
    }

    this.joystickKnobEl = this.el('div', 'virtual-joystick-knob');
    this.joystickBaseEl.append(this.joystickKnobEl);

    this.joystickBaseEl.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.joystickPointerId !== null) return;
      e.stopPropagation();
      e.preventDefault();
      this.joystickPointerId = e.pointerId;
      try {
        this.joystickBaseEl.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if capture is unsupported in synthetic events
      }
      this.joystickBaseEl.classList.add('active');
      this.updateJoystickFromPointer(e.clientX, e.clientY);
    });

    this.joystickBaseEl.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.joystickPointerId !== e.pointerId) return;
      e.stopPropagation();
      e.preventDefault();
      this.updateJoystickFromPointer(e.clientX, e.clientY);
    });

    const onJoystickRelease = (e: PointerEvent) => {
      if (this.joystickPointerId !== e.pointerId) return;
      e.stopPropagation();
      this.resetJoystick();
    };
    this.joystickBaseEl.addEventListener('pointerup', onJoystickRelease);
    this.joystickBaseEl.addEventListener('pointercancel', onJoystickRelease);
    this.joystickBaseEl.addEventListener('lostpointercapture', onJoystickRelease);

    // Right: Big Jump / Horn Button
    this.touchActionBtn = this.el('button', 'touch-action-btn pointer-on');
    this.touchActionBtn.type = 'button';
    this.touchActionIconEl = this.el('span', 'touch-action-icon', '⬆️');
    this.touchActionLabelEl = this.el('span', 'touch-action-label', 'ジャンプ');
    this.touchActionBtn.append(this.touchActionIconEl, this.touchActionLabelEl);

    this.touchActionBtn.addEventListener('pointerdown', (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.touchActionBtn.classList.add('pressed');
      this.cb.onPlayJump();
    });
    const clearActionPress = (e: PointerEvent) => {
      e.stopPropagation();
      this.touchActionBtn.classList.remove('pressed');
    };
    this.touchActionBtn.addEventListener('pointerup', clearActionPress);
    this.touchActionBtn.addEventListener('pointercancel', clearActionPress);
    this.touchActionBtn.addEventListener('pointerleave', clearActionPress);
    this.touchActionBtn.addEventListener('click', (e) => e.stopPropagation());

    this.touchPlayControlsEl.append(this.joystickBaseEl, this.touchActionBtn);
  }

  private updateJoystickFromPointer(clientX: number, clientY: number) {
    const rect = this.joystickBaseEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const knobSize = this.joystickKnobEl.offsetWidth || 46;
    const maxRadius = Math.max(12, (rect.width - knobSize) / 2);

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      const scale = maxRadius / dist;
      dx *= scale;
      dy *= scale;
    }

    this.joystickKnobEl.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;

    const normDist = Math.min(1, dist / maxRadius);
    if (normDist < 0.08) {
      this.cb.onVirtualMove?.(0, 0);
      return;
    }

    const right = dx / maxRadius;
    const forward = -dy / maxRadius;
    this.cb.onVirtualMove?.(forward, right);
  }

  private resetJoystick() {
    if (this.joystickPointerId !== null) {
      try {
        if (this.joystickBaseEl.hasPointerCapture(this.joystickPointerId)) {
          this.joystickBaseEl.releasePointerCapture(this.joystickPointerId);
        }
      } catch {
        // Ignore release errors
      }
    }
    this.joystickPointerId = null;
    this.joystickBaseEl.classList.remove('active');
    this.joystickKnobEl.style.transform = 'translate3d(0px, 0px, 0px)';
    this.cb.onVirtualMove?.(0, 0);
  }

  private shouldShowTouchPlayControls(): boolean {
    if (this.currentTool !== 'play') return false;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const compact = window.innerWidth <= 960 || window.innerHeight <= 520;
    return coarse || compact;
  }

  private syncTouchPlayControls() {
    const show = this.shouldShowTouchPlayControls();
    this.touchPlayControlsEl.classList.toggle('hidden', !show);

    if (!show) {
      if (this.joystickPointerId !== null) {
        this.resetJoystick();
      }
      return;
    }

    const isCar = this.playVehicle === 'car';
    this.touchActionBtn.classList.toggle('is-car', isCar);
    this.touchActionIconEl.textContent = isCar ? '📯' : '⬆️';
    this.touchActionLabelEl.textContent = isCar ? 'プップー' : 'ジャンプ';
    this.touchActionBtn.setAttribute('aria-label', isCar ? 'クラクション' : 'ジャンプ');

    requestAnimationFrame(() => this.positionTouchPlayControls());
  }

  private positionTouchPlayControls() {
    if (!this.touchPlayControlsEl || this.touchPlayControlsEl.classList.contains('hidden')) return;
    const dockRect = this.dockContainer.getBoundingClientRect();
    if (dockRect.height > 0) {
      const dockFromBottom = Math.max(0, window.innerHeight - dockRect.top);
      const desiredBottom = Math.max(60, Math.ceil(dockFromBottom + 12));
      this.touchPlayControlsEl.style.setProperty('--play-controls-bottom', `${desiredBottom}px`);
    } else {
      this.touchPlayControlsEl.style.removeProperty('--play-controls-bottom');
    }
  }

  public syncState(state: {
    tool: ToolMode;
    partId: string;
    colorId: string;
    stampId: string;
    continuous: boolean;
    canUndo: boolean;
    canRedo: boolean;
    brickCount: number;
    timeOfDay: TimeOfDay;
    theme: WorldTheme;
    muted: boolean;
    playVehicle: PlayVehicleMode;
    playCamera: PlayCameraMode;
    isSmashed: boolean;
    customStamps: StampDef[];
    completedMissionCount: number;
  }) {
    const toolChanged = this.currentTool !== state.tool;
    const smashedChanged = this.isSmashed !== state.isSmashed;
    const playChanged =
      this.playVehicle !== state.playVehicle || this.playCamera !== state.playCamera;
    const partChanged = this.currentPartId !== state.partId;
    const colorChanged = this.currentColorId !== state.colorId;
    const stampChanged =
      this.currentStampId !== state.stampId ||
      this.customStamps.length !== state.customStamps.length;

    this.currentTool = state.tool;
    this.currentPartId = state.partId;
    this.currentColorId = state.colorId;
    this.currentStampId = state.stampId;
    this.continuousDraw = state.continuous;
    this.currentTime = state.timeOfDay;
    this.currentTheme = state.theme;
    this.muted = state.muted;
    this.playVehicle = state.playVehicle;
    this.playCamera = state.playCamera;
    this.isSmashed = state.isSmashed;
    this.customStamps = state.customStamps;

    // Auto-switch category if part was picked by eyedropper
    if (partChanged) {
      const partObj = PARTS.find((p) => p.id === state.partId);
      if (partObj) this.currentCategory = partObj.category;
    }

    this.brickCountEl.textContent = `${state.brickCount.toLocaleString()}こ`;
    this.undoBtn.disabled = !state.canUndo || state.tool === 'play';
    this.redoBtn.disabled = !state.canRedo || state.tool === 'play';
    this.missionCountEl.textContent = `⭐${state.completedMissionCount}/${MISSIONS.length}`;

    this.syncTopBarState();

    if (toolChanged || smashedChanged || playChanged || partChanged || colorChanged || stampChanged) {
      this.renderDock();
    }

    this.syncTouchPlayControls();
  }

  private syncTopBarState() {
    for (const [id, btn] of this.toolBtns) {
      btn.classList.toggle('active', id === this.currentTool);
    }
    this.contBtn.classList.toggle('btn-toggle-on', this.continuousDraw);
    const tInfo = TIME_LABELS[this.currentTime];
    this.timeBtn.textContent = `${tInfo.icon} ${tInfo.label}`;
    this.muteBtn.textContent = this.muted ? '🔇' : '🔊';

    const hints: Record<ToolMode, string> = {
      build: 'ひだりクリック: おく ／ みぎドラッグ: ぐるぐるまわす ／ WASD: いどう ／ R: かいてん',
      delete: 'けしたい ブロックを クリック！（もどすボタンで いつでも 復活できるよ）',
      paint: 'したの パレットで いろを えらんで ブロックを クリック！',
      eyedropper: 'コピーしたい ブロックを クリックすると かたちと いろを まねできるよ！',
      stamp: 'おきばしょを クリックすると たてものや くるまが ポンッと できるよ！ R: かいてん',
      dynamite: 'クリックした ばしょが ドカーン！と とびちるよ！「もとにもどす」で きれいに復活！',
      play: 'WASD/やじるし: うごく ／ スペース: ジャンプ・クラクション ／ ドラッグ: みまわす ／ V: してん',
    };
    this.quickHintEl.textContent = hints[this.currentTool];
  }

  private renderDock() {
    this.dockContainer.innerHTML = '';

    // Special Mode: Play / Explore
    if (this.currentTool === 'play') {
      const panel = this.el('div', 'dock-panel');
      const banner = this.el('div', 'mode-banner play-mode-banner');

      const left = this.el('div', 'mode-banner-info');
      left.append(
        this.el(
          'div',
          'mode-banner-text',
          this.playVehicle === 'car'
            ? '🏎️ ブロックカートで ドライブちゅう！'
            : '🚶 にんぎょうに なって たんけんちゅう！'
        ),
        this.el(
          'div',
          'mode-banner-sub play-hint-desktop',
          'WASD / やじるしキー で いどう・ドラッグで みまわし・スペースで ジャンプ / プップー！'
        ),
        this.el(
          'div',
          'mode-banner-sub play-hint-mobile',
          'ひだりパッドで うごく・がめんドラッグで みまわす'
        )
      );

      const controls = this.el('div', 'slot-actions play-banner-actions');
      const walkBtn = this.el(
        'button',
        `btn ${this.playVehicle === 'walk' ? 'active' : ''}`,
        '🚶 あるく'
      );
      walkBtn.type = 'button';
      walkBtn.addEventListener('click', () => this.cb.onPlayVehicleChange('walk'));

      const carBtn = this.el(
        'button',
        `btn ${this.playVehicle === 'car' ? 'active' : ''}`,
        '🏎️ くるまにのる'
      );
      carBtn.type = 'button';
      carBtn.addEventListener('click', () => this.cb.onPlayVehicleChange('car'));

      const viewBtn = this.el(
        'button',
        'btn',
        this.playCamera === 'third' ? '👀 1にんしょうにする' : '👀 3にんしょうにする'
      );
      viewBtn.type = 'button';
      viewBtn.addEventListener('click', () => this.cb.onPlayCameraToggle());

      const jumpBtn = this.el(
        'button',
        'btn play-dock-jump-btn',
        this.playVehicle === 'car' ? '📯 プップー！' : '⬆️ ジャンプ！'
      );
      jumpBtn.type = 'button';
      jumpBtn.addEventListener('click', () => this.cb.onPlayJump());

      const backBtn = this.el('button', 'btn btn-play', '🧱 つくるに もどる');
      backBtn.type = 'button';
      backBtn.addEventListener('click', () => this.cb.onSelectTool('build'));

      controls.append(walkBtn, carBtn, viewBtn, jumpBtn, backBtn);
      banner.append(left, controls);
      panel.append(banner);
      this.dockContainer.append(panel);
      requestAnimationFrame(() => this.positionTouchPlayControls());
      return;
    }

    // Special Mode: Dynamite Test-Smash!
    if (this.currentTool === 'dynamite') {
      const panel = this.el('div', 'dock-panel');
      const banner = this.el('div', 'mode-banner');
      const left = this.el('div', 'mode-banner-info');
      left.append(
        this.el('div', 'mode-banner-text', '💣 テストくずし（ドカーン！モード）'),
        this.el(
          'div',
          'mode-banner-sub',
          'ブロックを クリックして ドカーンと あそぼう！だいじな 作品は ぜんぶ まきもどしで もとどおり！'
        )
      );
      const right = this.el('div', 'slot-actions mode-banner-actions');
      const rewindBtn = this.el('button', 'btn btn-play', '✨ まきもどして もとにもどす！');
      rewindBtn.type = 'button';
      rewindBtn.disabled = !this.isSmashed;
      rewindBtn.addEventListener('click', () => this.cb.onRewindSmash());
      const doneBtn = this.el('button', 'btn', '🧱 つくるに もどる');
      doneBtn.type = 'button';
      doneBtn.addEventListener('click', () => this.cb.onSelectTool('build'));
      right.append(rewindBtn, doneBtn);
      banner.append(left, right);
      panel.append(banner);
      this.dockContainer.append(panel);
      return;
    }

    // Special Mode: Stamp Palette!
    if (this.currentTool === 'stamp') {
      const panel = this.el('div', 'dock-panel');
      const header = this.el('div', 'dock-header-row stamp-header-row');
      const stampTitle = this.el('div', 'mode-banner-text');
      stampTitle.append(
        document.createTextNode('🏗️ かんせい はんこ'),
        this.el('span', 'stamp-title-sub', '（ポンッとおいて じゆうに かいぞうできるよ！）')
      );
      header.append(stampTitle);
      const rightBtns = this.el('div', 'slot-actions');
      const makeCustomBtn = this.el('button', 'btn btn-small', '⭐ いまの作品を はんこにする');
      makeCustomBtn.type = 'button';
      makeCustomBtn.addEventListener('click', () => this.cb.onCreateCustomStamp());
      rightBtns.append(makeCustomBtn);
      header.append(rightBtns);
      panel.append(header);

      const strip = this.el('div', 'parts-strip');
      const allStamps = [...this.customStamps, ...BUILTIN_STAMPS];
      for (const st of allStamps) {
        const card = this.el(
          'button',
          `stamp-card ${st.id === this.currentStampId ? 'active' : ''}`
        );
        card.type = 'button';
        card.title = st.description;
        card.append(
          this.el('div', 'stamp-emoji', st.emoji),
          this.el('div', 'stamp-name', st.name),
          this.el('div', 'stamp-count', `${st.bricks.length}パーツ`)
        );
        card.addEventListener('click', () => this.cb.onSelectStamp(st.id));
        strip.append(card);
      }
      panel.append(strip);
      this.dockContainer.append(panel);
      return;
    }

    // Standard Builder / Paint / Delete / Eyedropper Dock
    // 1) Color Swatch Bar (always handy for build & paint)
    if (this.currentTool === 'build' || this.currentTool === 'paint') {
      const colorPanel = this.el('div', 'dock-panel color-dock-panel');
      const colorBar = this.el('div', 'color-bar');
      const activeCol = getColorDef(this.currentColorId);
      colorBar.append(this.el('span', 'selected-color-name', `🎨 ${activeCol.name}`));

      for (const c of COLORS) {
        const sw = this.el(
          'button',
          `color-swatch kind-${c.kind} ${c.id === this.currentColorId ? 'active' : ''}`
        );
        sw.type = 'button';
        sw.style.backgroundColor = c.hex;
        sw.style.color = c.hex;
        sw.title = c.name;
        sw.setAttribute('aria-label', c.name);
        sw.addEventListener('click', () => this.cb.onSelectColor(c.id));
        colorBar.append(sw);
      }
      colorPanel.append(colorBar);
      this.dockContainer.append(colorPanel);
    }

    // 2) Part Picker Panel (for Build tool)
    if (this.currentTool === 'build') {
      const partPanel = this.el('div', 'dock-panel');
      const headerRow = this.el('div', 'dock-header-row');

      const tabs = this.el('div', 'category-tabs');
      for (const cat of PART_CATEGORIES) {
        const tab = this.el(
          'button',
          `cat-tab ${cat.id === this.currentCategory ? 'active' : ''}`
        );
        tab.type = 'button';
        tab.textContent = `${cat.icon} ${cat.name}`;
        tab.addEventListener('click', () => {
          this.currentCategory = cat.id;
          this.dockCollapsed = false;
          this.renderDock();
        });
        tabs.append(tab);
      }

      const collapseBtn = this.el('button', 'btn btn-small dock-collapse-btn');
      collapseBtn.type = 'button';
      collapseBtn.append(
        this.el(
          'span',
          'collapse-label-desktop',
          this.dockCollapsed ? '▲ パーツをひらく' : '▼ しまっておく'
        ),
        this.el(
          'span',
          'collapse-label-mobile',
          this.dockCollapsed ? '▲ ひらく' : '▼ とじる'
        )
      );
      collapseBtn.addEventListener('click', () => {
        this.dockCollapsed = !this.dockCollapsed;
        this.renderDock();
      });

      headerRow.append(tabs, collapseBtn);
      partPanel.append(headerRow);

      if (!this.dockCollapsed) {
        const strip = this.el('div', 'parts-strip');
        const filtered = PARTS.filter((p) => p.category === this.currentCategory);
        for (const part of filtered) {
          const card = this.el(
            'button',
            `part-card ${part.id === this.currentPartId ? 'active' : ''}`
          );
          card.type = 'button';
          card.title = `${part.name} (${part.sx}×${part.sz})`;
          const img = this.el('img');
          img.src = this.thumbnails.get(part.id) ?? '';
          img.alt = part.name;
          const lbl = this.el('span', 'part-card-label', part.name);
          card.append(img, lbl);
          card.addEventListener('click', () => this.cb.onSelectPart(part.id));
          strip.append(card);
        }
        partPanel.append(strip);
      }

      this.dockContainer.append(partPanel);
    }
  }

  public showToast(message: string, isMission = false) {
    // Keep at most 2 visible toasts so center of the 3D scene stays clean!
    while (this.toastContainer.children.length >= 2) {
      this.toastContainer.firstElementChild?.remove();
    }
    const t = this.el('div', `toast ${isMission ? 'toast-mission' : ''}`, message);
    this.toastContainer.append(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.35s ease';
      setTimeout(() => t.remove(), 380);
    }, isMission ? 3400 : 2000);
  }

  public updateMinimap(
    theme: WorldTheme,
    bricks: Array<{ x: number; z: number; colorId: string; partId: string }>,
    focusX: number,
    focusZ: number
  ) {
    const ctx = this.minimapCanvas.getContext('2d');
    if (!ctx) return;

    // Background by theme
    if (theme === 'meadow') ctx.fillStyle = '#53b444';
    else if (theme === 'city') ctx.fillStyle = '#5ab850';
    else if (theme === 'island') ctx.fillStyle = '#0284c7';
    else ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    if (theme === 'island') {
      ctx.fillStyle = '#f3d893';
      ctx.beginPath();
      ctx.arc(64, 64, 51, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#53b444';
      ctx.beginPath();
      ctx.arc(64, 64, 42, 0, Math.PI * 2);
      ctx.fill();
    } else if (theme === 'city') {
      ctx.fillStyle = '#475569';
      for (const band of [24, 60, 96]) {
        ctx.fillRect(band, 0, 10, WORLD_SIZE);
        ctx.fillRect(0, band, WORLD_SIZE, 10);
      }
    } else if (theme === 'space') {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(64, 64, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw every placed brick!
    for (const b of bricks) {
      const col = getColorDef(b.colorId);
      ctx.fillStyle = col.hex;
      ctx.fillRect(b.x, b.z, 2, 2);
    }

    // Draw camera / player crosshair marker
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(focusX, focusZ, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(focusX, focusZ, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ==================== Modals ====================

  public openModal(kind: 'world' | 'missions' | 'help') {
    if (this.joystickPointerId !== null) {
      this.resetJoystick();
    }
    this.activeModal = kind;
    this.modalBackdrop.classList.remove('hidden');
    this.renderModalContent();
  }

  public closeModal() {
    this.activeModal = 'none';
    this.modalBackdrop.classList.add('hidden');
  }

  private renderModalContent() {
    this.modalCard.innerHTML = '';

    const header = this.el('div', 'modal-header');
    const titleText =
      this.activeModal === 'world'
        ? '🌍 ワールド・セーブメニュー'
        : this.activeModal === 'missions'
          ? '⭐ おだいチャレンジ！'
          : '❓ あそびかたガイド';
    header.append(this.el('div', 'modal-title', titleText));
    const closeBtn = this.el('button', 'btn btn-small', '✖ とじる');
    closeBtn.addEventListener('click', () => this.closeModal());
    header.append(closeBtn);
    this.modalCard.append(header);

    if (this.activeModal === 'world') {
      this.renderWorldModal();
    } else if (this.activeModal === 'missions') {
      this.renderMissionsModal();
    } else if (this.activeModal === 'help') {
      this.renderHelpModal();
    }
  }

  private renderWorldModal() {
    // 1) World Theme Picker
    const sec1 = this.el('div', 'modal-section');
    sec1.append(this.el('h3', '', '🗺️ せかいの ちけいを えらぶ（128×128の だいへいげん！）'));
    const grid = this.el('div', 'theme-grid');
    for (const th of THEME_INFOS) {
      const btn = this.el(
        'button',
        `theme-btn ${th.id === this.currentTheme ? 'active' : ''}`
      );
      btn.type = 'button';
      btn.append(this.el('span', 'theme-emoji', th.emoji));
      const info = this.el('div');
      info.append(
        this.el('div', 'theme-name', th.name),
        this.el('div', 'theme-desc', th.desc)
      );
      btn.append(info);
      btn.addEventListener('click', () => {
        this.cb.onSelectTheme(th.id);
        this.currentTheme = th.id;
        this.renderModalContent();
      });
      grid.append(btn);
    }
    sec1.append(grid);
    this.modalCard.append(sec1);

    // 2) Time of Day
    const secTime = this.el('div', 'modal-section');
    secTime.append(this.el('h3', '', '🌤️ じかんを かえる'));
    const timeRow = this.el('div', 'slot-actions');
    for (const t of ['morning', 'day', 'sunset', 'night'] as TimeOfDay[]) {
      const info = TIME_LABELS[t];
      const b = this.el(
        'button',
        `btn ${t === this.currentTime ? 'active' : ''}`,
        `${info.icon} ${info.label}`
      );
      b.addEventListener('click', () => {
        this.cb.onSelectTime(t);
        this.currentTime = t;
        this.renderModalContent();
      });
      timeRow.append(b);
    }
    secTime.append(timeRow);
    this.modalCard.append(secTime);

    // 3) Quick Actions: Photo, File Save/Load, Starter/Clear
    const secAct = this.el('div', 'modal-section');
    secAct.append(this.el('h3', '', '📷 しゃしん・ファイル・リセット'));
    const actRow = this.el('div', 'slot-actions');
    actRow.style.flexWrap = 'wrap';

    const photoBtn = this.el('button', 'btn btn-play', '📷 しゃしんをとる (PNG)');
    photoBtn.addEventListener('click', () => {
      this.closeModal();
      setTimeout(() => this.cb.onTakeScreenshot(), 80);
    });

    const expBtn = this.el('button', 'btn', '💾 ファイルにほぞん');
    expBtn.addEventListener('click', () => this.cb.onExportJson());

    const impBtn = this.el('button', 'btn', '📂 ファイルからよみこみ');
    const fileInput = this.el('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) {
        this.cb.onImportJson(f);
        this.closeModal();
      }
      fileInput.value = '';
    });
    impBtn.addEventListener('click', () => fileInput.click());

    const starterBtn = this.el('button', 'btn', '🏡 はじめのむらを おく');
    starterBtn.addEventListener('click', () => {
      this.cb.onResetWorldStarter();
      this.closeModal();
    });

    const clearBtn = this.el('button', 'btn btn-danger', '🧹 ぜんぶ けして まっさらにする');
    let confirmClear = false;
    clearBtn.addEventListener('click', () => {
      if (!confirmClear) {
        confirmClear = true;
        clearBtn.textContent = '⚠️ ほんとうに ぜんぶ けす？（もういちどおす）';
        clearBtn.classList.add('active');
        return;
      }
      this.cb.onClearWorld();
      this.closeModal();
    });

    actRow.append(photoBtn, expBtn, impBtn, fileInput, starterBtn, clearBtn);
    secAct.append(actRow);
    this.modalCard.append(secAct);

    // 4) Local Save Slots (100% browser local, safe & private)
    const secSlots = this.el('div', 'modal-section');
    secSlots.append(this.el('h3', '', '💿 ワールドほぞん（このたんまつの なかに あんぜんに ほぞんされます）'));

    const nameInput = this.el('input', 'world-name-input');
    nameInput.type = 'text';
    nameInput.maxLength = 32;
    nameInput.placeholder = 'ワールドの なまえ（例：おおきなおしろ）';
    nameInput.value = this.cb.getCurrentWorldName();
    secSlots.append(nameInput);

    const existing = new Map(this.cb.getSaveSlots().map((s) => [s.slot, s]));
    const list = this.el('div', 'slot-list');
    for (let slot = 1; slot <= 6; slot++) {
      const data = existing.get(slot);
      const row = this.el('div', 'slot-row');
      const info = this.el('div', 'slot-info');
      info.append(
        this.el('div', 'slot-name', data ? `スロット ${slot}: ${data.name}` : `スロット ${slot}: （あき）`),
        this.el(
          'div',
          'slot-meta',
          data
            ? `ブロック ${data.brickCount}こ ・ ${new Date(data.savedAt).toLocaleString('ja-JP')}`
            : 'まだ ほぞんされていません'
        )
      );
      const btns = this.el('div', 'slot-actions');
      const saveB = this.el('button', 'btn btn-small active', 'ほぞん');
      saveB.addEventListener('click', () => {
        this.cb.onSaveSlot(slot, nameInput.value);
        this.renderModalContent();
      });
      const loadB = this.el('button', 'btn btn-small', 'よみこむ');
      loadB.disabled = !data;
      loadB.addEventListener('click', () => {
        this.cb.onLoadSlot(slot);
        this.closeModal();
      });
      btns.append(saveB, loadB);
      row.append(info, btns);
      list.append(row);
    }
    secSlots.append(list);
    this.modalCard.append(secSlots);
  }

  private renderMissionsModal() {
    const completed = this.cb.getCompletedMissions();
    const intro = this.el(
      'p',
      'mode-banner-sub',
      'じゆうに あそびながら、おだいを クリアして ほし⭐を あつめよう！'
    );
    intro.style.marginBottom = '12px';
    this.modalCard.append(intro);

    const list = this.el('div', 'mission-list');
    for (const m of MISSIONS) {
      const done = completed.has(m.id);
      const item = this.el('div', `mission-item ${done ? 'done' : ''}`);
      item.append(this.el('div', 'mission-icon', m.icon));
      const textWrap = this.el('div');
      textWrap.append(
        this.el('div', 'slot-name', m.title),
        this.el('div', 'slot-meta', m.description)
      );
      const badge = this.el('span', 'mission-badge', done ? '⭐ クリア！' : 'チャレンジ中');
      item.append(textWrap, badge);
      list.append(item);
    }
    this.modalCard.append(list);
  }

  private renderHelpModal() {
    const grid = this.el('div', 'help-grid');
    const items: Array<[string, string]> = [
      [
        '🧱 ブロックを おく',
        'したの パレットから かたちと いろを えらんで クリック（スマホは タップ）！ Rキーか「まわす」ボタンで 90ど かいてん できます。',
      ],
      [
        '📱 スマホ・タブレット操作',
        '1本指ドラッグ：カメラかいてん ／ タップ：ブロックをおく ／ 2本指：ズーム・いどう！みぎの 🗺️ボタンで マップと カメラボタンを ひらけます。',
      ],
      [
        '🎥 カメラの うごかし方（PC）',
        'みぎクリックしながら ドラッグで ぐるぐるかいてん！ホイールで ズーム、WASDか やじるしキーで ひろいせかいを いどうできます。みぎ下の マップクリックでも とべます！',
      ],
      [
        '✨ れんぞくおき ＆ はんこ',
        'うえの「れんぞく」を ONにすると かべや みちを いっきに ならべられます！「はんこ」なら おうちや パトカー・ロケットを ワンタップで おけます。',
      ],
      [
        '🚶 あそぶ・ドライブ',
        '「あそぶ！」で ブロックにんぎょうや くるまに なって ぼうけん！PCは WASD＋スペース、スマホ・タブレットは ひだりパッドで うごいて みぎボタンで ジャンプ／クラクション！',
      ],
      [
        '💣 ドカーン＆まきもどし',
        'つくった 作品を ドカーンと とばして あそんでも、「まきもどす」ボタンで いつでも ピタッと 復活します！',
      ],
    ];
    for (const [title, desc] of items) {
      const box = this.el('div', 'help-box');
      const strong = this.el('strong', '', title);
      box.append(strong, document.createTextNode(desc));
      grid.append(box);
    }
    this.modalCard.append(grid);

    const safetyNote = this.el(
      'p',
      'mode-banner-sub',
      '🔒 あんぜん設計：インターネットへの 送信・広告・課金は いっさいありません。つくった作品は このたんまつの なかに じどうで ほぞんされます。'
    );
    safetyNote.style.marginTop = '14px';
    this.modalCard.append(safetyNote);

    const licenseNote = this.el(
      'p',
      'mode-banner-sub',
      '📄 ライセンス：ブロックワールド 3D (MIT License) ／ 3D描画に Three.js (© 2010-2026 three.js authors, MIT License) を使用しています。'
    );
    licenseNote.style.marginTop = '6px';
    licenseNote.style.fontSize = '11px';
    this.modalCard.append(licenseNote);
  }
}
