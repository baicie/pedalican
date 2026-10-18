import * as THREE from 'three';
import { Bicycle } from '../character/Bicycle';
import { Pelican } from '../character/Pelican';
import { RidingAnimation } from '../character/RidingAnimation';
import { BicyclePhysics } from '../physics/BicyclePhysics';
import { CollisionSystem, type CrashReason, type ObstacleHit } from '../physics/CollisionSystem';
import { LevelManager, type CheckpointSpec, type GapSpec } from '../gameplay/LevelManager';
import { Collectibles } from '../gameplay/Collectibles';
import { Obstacles } from '../gameplay/Obstacles';
import { ScoreManager } from '../gameplay/ScoreManager';
import { World } from '../scene/World';
import { Environment } from '../scene/Environment';
import { Lighting } from '../scene/Lighting';
import { CameraController, type CameraView } from '../scene/CameraController';
import { InputManager } from './InputManager';
import { GameLoop, type LoopStats } from './GameLoop';
import { GameState, type GamePhase, type HUDState, type RunResult } from './GameState';
import { UIManager } from '../ui/UIManager';
import { ParticleSystem } from '../utils/ParticleSystem';
import { gameAudio } from '../audio/AudioManager';
import { onLocaleChange, t, translateCheckpoint } from '../i18n/I18n';
import { clamp, damp } from '../utils/math';

export interface PelicanRiderDebugState {
  phase: GamePhase;
  position: { x: number; y: number; z: number };
  speed: number;
  speedKmh: number;
  health: number;
  score: number;
  fish: number;
  fishRemaining: number;
  progress: number;
  runTime: number;
  countdown: number;
  cameraMode: string;
  stats: LoopStats;
}

export interface PelicanRiderDebugApi {
  startRun(): void;
  skipCountdown(): void;
  getDebugState(): PelicanRiderDebugState;
  teleportNearFinish(): void;
}

interface SafePoint {
  x: number;
  z: number;
  yaw: number;
}

const START_HEARTS = 3;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly level: LevelManager;
  private readonly environment: Environment;
  private readonly world: World;
  private readonly obstacles: Obstacles;
  private readonly collectibles: Collectibles;
  private readonly particles: ParticleSystem;
  private readonly lighting: Lighting;
  private readonly bicycle: Bicycle;
  private readonly pelican: Pelican;
  private readonly riding: RidingAnimation;
  private readonly physics: BicyclePhysics;
  private readonly collisions: CollisionSystem;
  private readonly cameraController: CameraController;
  private readonly state = new GameState();
  private readonly score = new ScoreManager();
  private readonly input: InputManager;
  private readonly playerRoot = new THREE.Group();
  private readonly leanGroup = new THREE.Group();
  private readonly loop: GameLoop;
  private readonly ui: UIManager;

  private readonly playerCenter = new THREE.Vector3();
  private readonly cameraView: CameraView = {
    position: new THREE.Vector3(),
    yaw: 0,
    speed: 0,
    verticalHeight: 0,
    grounded: true,
    lean: 0,
  };
  private readonly debugView: PelicanRiderDebugState['position'] = { x: 0, y: 0, z: 0 };

  private visualTime = 0;
  private countdownRemaining = 0;
  private lastCountdownDigit = 4;
  private crashTimer = 0;
  private crashDuration = 1.1;
  private crashProgress = 0;
  private crashReason = '';
  private crashSide = 1;
  private crashFromHazard = false;
  private crashFatal = false;
  private pendingRecovery: SafePoint | null = null;
  private safeTrail: SafePoint[] = [];
  private safeTrailTimer = 0;
  private currentGround = 0.04;
  private suspension = 0;
  private pitch = 0;
  private offroadCooldown = 0;
  private gapWarning = false;
  private fishWarning = false;
  private loadingHidden = false;
  private disposed = false;
  private unsubscribeLocale: (() => void) | null = null;
  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color('#c7e4df');
    this.scene.fog = new THREE.Fog('#c7e4df', 82, 320);
    this.camera = new THREE.PerspectiveCamera(
      57,
      window.innerWidth / window.innerHeight,
      0.1,
      900,
    );

    this.level = new LevelManager();
    this.lighting = new Lighting(this.scene);
    this.environment = new Environment(this.scene, this.level);
    this.world = new World(this.scene, this.level);
    this.obstacles = new Obstacles(this.level);
    this.collectibles = new Collectibles(this.level);
    this.scene.add(this.obstacles.root, this.collectibles.root);
    this.particles = new ParticleSystem(this.renderer.getPixelRatio());
    this.scene.add(this.particles.root);

    this.bicycle = new Bicycle();
    this.pelican = new Pelican();
    this.leanGroup.add(this.bicycle.root, this.pelican.root);
    this.playerRoot.add(this.leanGroup);
    this.playerRoot.name = 'player';
    this.scene.add(this.playerRoot);
    this.riding = new RidingAnimation(this.bicycle, this.pelican);
    this.physics = new BicyclePhysics(this.level);
    this.collisions = new CollisionSystem(this.level);
    this.cameraController = new CameraController(this.camera);
    this.input = new InputManager();

    this.ui = new UIManager({
      onStart: () => {
        gameAudio.unlock();
        gameAudio.uiClick();
        this.startNewRun();
      },
      onResume: () => {
        gameAudio.uiClick();
        this.resumeGame();
      },
      onRestart: () => {
        gameAudio.uiClick();
        this.startNewRun();
      },
      onMenu: () => {
        gameAudio.uiClick();
        this.enterMenu();
      },
    });
    this.unsubscribeLocale = onLocaleChange(() => this.updateHud());

    this.resetWorldState();
    this.ui.showMenu(this.score.bestScore, this.score.bestTime);
    this.loop = new GameLoop(this.frame);
    this.bindEvents();
    this.installDebugApi();
    this.updateHud();
  }

  start(): void {
    this.loop.start();
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  private readonly handleResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    this.renderer.setSize(width, height, false);
    this.particles.setPixelRatio(this.renderer.getPixelRatio());
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private readonly handleVisibility = (): void => {
    if (document.hidden && this.state.phase === 'playing') {
      this.pauseGame();
    }
  };

  private resetWorldState(): void {
    this.state.resetRun();
    this.state.phase = 'menu';
    this.state.health = START_HEARTS;
    this.score.reset();
    this.physics.resetAt(
      this.level.centerX(this.level.data.startZ),
      this.level.data.startZ,
      this.level.startYaw(),
    );
    this.physics.setRespawnPoint(
      this.level.centerX(this.level.data.startZ),
      this.level.data.startZ,
      this.level.startYaw(),
    );
    this.collectibles.reset();
    this.safeTrail = [];
    this.safeTrailTimer = 0;
    this.countdownRemaining = 0;
    this.currentGround = 0.04;
    this.suspension = 0;
    this.pitch = 0;
    this.crashProgress = 0;
    this.crashTimer = 0;
    this.crashFatal = false;
    this.pendingRecovery = null;
    this.crashFromHazard = false;
    this.gapWarning = false;
    this.fishWarning = false;
    this.offroadCooldown = 0;
    this.leanGroup.rotation.set(0, 0, 0);
    this.syncPlayerRoot(0);
    this.riding.updateIdle(0, 1 / 60);
    this.cameraController.updateMenu(1 / 60, {
      position: this.playerRoot.position,
      time: 0,
    });
    this.ui.hideJumpPrompts();
    this.ui.clearCountdown();
  }

  private beginCountdown(fromMenu: boolean): void {
    const previous = this.state.phase;
    this.state.resetRun();
    this.state.phase = 'countdown';
    this.score.reset();
    this.collectibles.reset();
    this.physics.resetAt(
      this.level.centerX(this.level.data.startZ),
      this.level.data.startZ,
      this.level.startYaw(),
    );
    this.physics.setRespawnPoint(
      this.level.centerX(this.level.data.startZ),
      this.level.data.startZ,
      this.level.startYaw(),
    );
    this.safeTrail = [];
    this.safeTrailTimer = 0;
    this.currentGround = 0.04;
    this.suspension = 0;
    this.pitch = 0;
    this.gapWarning = false;
    this.fishWarning = false;
    this.offroadCooldown = 0;
    this.countdownRemaining = 3;
    this.lastCountdownDigit = 3;
    this.leanGroup.rotation.set(0, 0, 0);
    this.syncPlayerRoot(0);
    this.riding.updateIdle(this.visualTime, 1 / 60);
    this.ui.beginRide();
    this.ui.hideJumpPrompts();
    this.ui.showCountdown('3');
    gameAudio.countdown(3);
    this.cameraController.setMode('chase');
    if (fromMenu || previous === 'menu') {
      this.cameraController.beginRide();
    } else {
      this.cameraController.snapBehind(this.makeCameraView());
    }
    this.updateHud();
  }

  private startNewRun(): void {
    const fromMenu = this.state.phase === 'menu';
    this.beginCountdown(fromMenu);
  }

  private updateCountdown(dt: number): void {
    this.countdownRemaining -= dt;
    this.syncPlayerRoot(0);
    this.riding.updateIdle(this.visualTime, dt);
    const digit = Math.ceil(this.countdownRemaining);
    if (digit !== this.lastCountdownDigit && digit > 0) {
      this.lastCountdownDigit = digit;
      this.ui.showCountdown(String(digit));
      gameAudio.countdown(digit);
    }
    if (this.countdownRemaining <= 0) {
      this.state.phase = 'playing';
      this.ui.showCountdown('GO!');
      gameAudio.go();
      this.offroadCooldown = 0;
    }
    this.cameraController.update(dt, this.makeCameraView());
    this.updateHud();
  }

  private updatePlaying(dt: number): void {
    this.state.invulnerable = Math.max(0, this.state.invulnerable - dt);
    this.offroadCooldown = Math.max(0, this.offroadCooldown - dt);
    this.state.runTime += dt;

    const jumpPressed = this.input.consume('jump');
    const wasGrounded = this.physics.grounded;
    this.physics.update(dt, {
      throttle: this.input.throttle,
      brake: this.input.brake,
      steer: this.input.steer,
      jumpPressed,
    });
    if (jumpPressed && wasGrounded && !this.physics.grounded) {
      gameAudio.jump();
    }
    this.state.distance = Math.max(
      this.state.distance,
      this.level.distanceForZ(this.physics.position.z),
    );

    if (this.physics.justLanded) {
      this.suspension = -0.06;
      this.particles.landing(this.playerRoot.position.clone().setY(0.12));
      this.cameraController.triggerShake(0.035, 0.22);
      gameAudio.land();
    }
    this.suspension = damp(this.suspension, 0, 11, dt);

    this.updateGroundAndPose(dt);
    this.riding.update({
      dt,
      time: this.visualTime,
      snapshot: this.physics.snapshot(),
      steering: this.physics.steerInput,
      crashFactor: 0,
    });

    this.updateSafeTrail(dt);
    this.collectFish();
    this.checkRaceProgress();
    if (this.state.phase !== 'playing') {
      this.updateHud();
      return;
    }

    this.checkHazards();
    if (this.state.phase !== 'playing') {
      this.updateHud();
      return;
    }

    this.updateWarnings();

    if (this.physics.offRoad && this.offroadCooldown <= 0) {
      this.offroadCooldown = 5.5;
      this.ui.toast(t('toast.offroad'), '!', 1600);
    }

    this.cameraController.update(dt, this.makeCameraView());
    this.updateHud();
  }

  private updateCrash(dt: number): void {
    this.crashTimer = Math.max(0, this.crashTimer - dt);
    this.crashProgress = 1 - this.crashTimer / this.crashDuration;
    this.state.runTime += dt;

    this.physics.update(dt, {
      throttle: false,
      brake: true,
      steer: 0,
      jumpPressed: false,
    });
    this.suspension = damp(this.suspension, 0, 10, dt);

    const fallProgress = clamp((this.crashProgress - 0.2) / 0.7, 0, 1);
    const fallDrop = this.crashFromHazard ? fallProgress * 1.25 : 0;
    this.currentGround = damp(this.currentGround, 0.04, 9, dt);
    const tip = Math.min(1, this.crashProgress * 2.4);
    this.playerRoot.position.set(
      this.physics.position.x,
      this.currentGround + this.physics.height + this.suspension - fallDrop,
      this.physics.position.z,
    );
    this.playerRoot.rotation.y = this.physics.yaw;
    this.leanGroup.rotation.z = damp(
      this.leanGroup.rotation.z,
      this.crashSide * 0.82 * tip,
      7,
      dt,
    );
    this.leanGroup.rotation.x = damp(
      this.leanGroup.rotation.x,
      this.crashFromHazard ? 0.12 * tip : -0.05 * tip,
      7,
      dt,
    );

    this.riding.update({
      dt,
      time: this.visualTime,
      snapshot: this.physics.snapshot(),
      steering: 0,
      crashFactor: Math.min(1, this.crashProgress * 2),
    });

    this.cameraController.update(dt, this.makeCameraView());
    this.updateHud();

    if (this.crashTimer <= 0) {
      if (this.crashFatal || this.state.health <= 0) {
        this.finishRun(false, this.crashReason);
      } else {
        this.recoverFromCrash();
      }
    }
  }

  private updateHud(): void {
    const phase = this.state.phase;
    if (phase === 'menu' || phase === 'finished' || phase === 'gameover') {
      return;
    }
    const nextCheckpoint = this.level.data.checkpoints[this.state.checkpointIndex];
    const state: HUDState = {
      phase,
      score: this.score.score,
      fish: this.score.fish,
      scoreCombo: this.score.combo,
      hearts: this.state.health,
      maxHearts: this.state.maxHealth,
      time: this.state.runTime,
      distance: this.state.distance,
      progress: this.level.progressForZ(
        Math.max(this.physics.position.z, this.level.data.startZ),
      ),
      speedKmh: this.physics.speed * 3.6,
      motion: this.getMotionLabel(),
      cameraLabel: this.getCameraLabel(),
      gapWarning: this.gapWarning,
      fishWarning: this.fishWarning,
      checkpointLabel: nextCheckpoint
        ? translateCheckpoint(nextCheckpoint.label)
        : 'LIGHTHOUSE',
      bestScore: this.score.bestScore,
      bestTime: this.score.bestTime,
      fast: this.physics.speed > 10.8 && phase === 'playing',
    };
    this.ui.updateHUD(state);
  }

  private getMotionLabel(): string {
    if (this.state.phase === 'crashed') return t('motion.tumbling');
    if (this.state.phase === 'paused') return t('motion.paused');
    if (this.state.phase === 'countdown') return t('motion.ready');
    if (!this.physics.grounded) return t('motion.airborne');
    if (this.input.brake) return t('motion.braking');
    if (this.physics.speed < 0.35) return t('motion.ready');
    if (this.physics.offRoad) return t('motion.offtrail');
    if (this.input.throttle) return t('motion.pedaling');
    return t('motion.coasting');
  }

  private getCameraLabel(): string {
    const mode = this.cameraController.mode;
    if (mode === 'close') return t('camera.close');
    if (mode === 'coast') return t('camera.coast');
    return t('camera.chase');
  }

  private updateGroundAndPose(dt: number): void {
    const lateral = this.level.lateralAt(this.physics.position.x, this.physics.position.z);
    let groundTarget = 0.04;
    if (this.level.bridgeAt(this.physics.position.z)) {
      groundTarget = 0.09;
    } else if (Math.abs(lateral) > this.level.roadHalfWidth()) {
      groundTarget = Math.max(0.04, this.world.getGroundHeight(lateral, this.physics.position.z) + 0.04);
    }
    this.currentGround = damp(this.currentGround, groundTarget, 9, dt);

    this.pitch = damp(
      this.pitch,
      this.physics.grounded
        ? 0
        : clamp(-this.physics.verticalVelocity * 0.017, -0.085, 0.085),
      6.5,
      dt,
    );
    const wobble = this.physics.offRoad
      ? Math.sin(this.visualTime * 16) * 0.032 * clamp(this.physics.speed / 7, 0, 1)
      : 0;
    this.playerRoot.position.set(
      this.physics.position.x,
      this.currentGround + this.physics.height + this.suspension,
      this.physics.position.z,
    );
    this.playerRoot.rotation.y = this.physics.yaw;
    this.leanGroup.rotation.z = damp(
      this.leanGroup.rotation.z,
      this.physics.lean + wobble,
      9,
      dt,
    );
    this.leanGroup.rotation.x = damp(this.leanGroup.rotation.x, this.pitch, 9, dt);
  }

  private updateSafeTrail(dt: number): void {
    this.safeTrailTimer += dt;
    if (this.safeTrailTimer < 0.24) return;
    this.safeTrailTimer = 0;
    if (!this.physics.grounded || this.physics.offRoad) return;
    if (this.level.gapAt(this.physics.position.z)) return;
    this.safeTrail.push({
      x: this.physics.position.x,
      z: this.physics.position.z,
      yaw: this.physics.yaw,
    });
    if (this.safeTrail.length > 18) this.safeTrail.shift();
  }

  private collectFish(): void {
    this.playerCenter.set(
      this.physics.position.x,
      this.playerRoot.position.y + 1.32,
      this.physics.position.z,
    );
    const collected = this.collectibles.collectNear(this.playerCenter, 1.08, 0.48);
    if (collected.length === 0) return;
    let points = 0;
    for (const fish of collected) {
      points += this.score.registerFish(this.state.runTime, 1);
      this.particles.fishBurst(fish.position);
    }
    gameAudio.fish(this.score.combo);
    const multiplierText =
      this.score.combo > 1
        ? ` · x${(1 + (this.score.combo - 1) * 0.25).toFixed(2)}`
        : '';
    this.ui.toast(t('toast.fish', { points, multiplier: multiplierText }), '✦', 1250);
  }

  private checkRaceProgress(): void {
    const checkpointIndex = this.collisions.checkCheckpoint(
      this.physics,
      this.state.checkpointIndex,
    );
    if (checkpointIndex >= 0) {
      const checkpoint = this.level.data.checkpoints[checkpointIndex] as CheckpointSpec;
      this.state.checkpointIndex = checkpointIndex + 1;
      const healed = this.state.health < this.state.maxHealth;
      this.state.heal(1);
      this.score.registerCheckpoint();
      const point = this.level.pointAt(checkpoint.z + 2, 0);
      this.physics.setRespawnPoint(point.x, point.z, this.level.yawAt(checkpoint.z + 2));
      this.particles.checkpoint(
        this.level.pointAt(checkpoint.z, 0).setY(2.2),
      );
      gameAudio.checkpoint();
      this.ui.toast(
        t('checkpoint.toast', {
          label: translateCheckpoint(checkpoint.label),
          healed: healed ? t('checkpoint.healed') : '',
        }),
        '✓',
        2400,
      );
    }

    if (this.collisions.isAtFinish(this.physics)) {
      this.finishRun(true, t('finish.reason'));
    }
  }

  private checkHazards(): void {
    if (this.state.invulnerable > 0) {
      if (this.collisions.checkGap(this.physics)) {
        this.beginCrash('gap');
      }
      return;
    }

    const hit = this.collisions.checkObstacles(this.physics);
    if (hit) {
      this.handleObstacleHit(hit);
      return;
    }
    if (this.collisions.checkGap(this.physics)) {
      this.beginCrash('gap');
      return;
    }
    if (this.collisions.checkBoundary(this.physics)) {
      this.beginCrash('offroad');
    }
  }

  private handleObstacleHit(hit: ObstacleHit): void {
    const reason = this.collisions.obstacleCrashReason(hit.obstacle);
    this.crashSide = Math.sign(this.level.lateralAt(hit.worldPosition.x, hit.worldPosition.z)) || 1;
    this.pendingRecovery = this.findSafeRecovery();
    this.beginCrash(reason);
  }

  private findSafeRecovery(): SafePoint {
    for (let i = this.safeTrail.length - 1; i >= 0; i -= 1) {
      const point = this.safeTrail[i] as SafePoint;
      if (this.physics.position.z - point.z > 2.6) {
        return point;
      }
    }
    const fallbackZ = Math.max(
      this.level.data.startZ,
      this.physics.position.z - 3.6,
    );
    const fallback = this.level.pointAt(fallbackZ, 0);
    return { x: fallback.x, z: fallback.z, yaw: this.level.yawAt(fallbackZ) };
  }

  private beginCrash(reason: CrashReason): void {
    if (this.state.phase !== 'playing') return;
    const wasInvulnerable = this.state.invulnerable > 0;
    const fatal = wasInvulnerable ? this.state.health <= 0 : this.state.damage();
    this.crashFatal = fatal;
    this.crashFromHazard = reason === 'gap' || reason === 'offroad';
    this.crashReason = this.describeCrash(reason);
    gameAudio.crash();
    this.crashDuration = this.crashFromHazard ? 1.35 : 1.1;
    this.crashTimer = this.crashDuration;
    this.crashProgress = 0;
    this.state.phase = 'crashed';
    this.physics.applyCrashSlowdown();
    this.ui.crashFlash();
    this.ui.hideJumpPrompts();
    this.ui.toast(this.crashReason, '!', 1800);
    this.particles.crashDust(this.playerRoot.position.clone().setY(0.18), 18);
    this.cameraController.triggerShake(0.09, 0.42);
    this.gapWarning = false;
    this.fishWarning = false;
    if (this.crashFatal) {
      this.crashReason = this.describeCrash(reason);
    }
  }

  private recoverFromCrash(): void {
    if (this.crashFromHazard || !this.pendingRecovery) {
      this.physics.respawnAtCheckpoint();
    } else {
      const point = this.pendingRecovery;
      this.physics.placeAt(point.x, point.z, point.yaw);
    }
    this.pendingRecovery = null;
    this.crashTimer = 0;
    this.crashProgress = 0;
    this.crashFromHazard = false;
    this.crashFatal = false;
    this.suspension = 0;
    this.pitch = 0;
    this.leanGroup.rotation.set(0, 0, 0);
    this.currentGround = 0.04;
    this.physics.setRespawnPoint(
      this.physics.position.x,
      this.physics.position.z,
      this.physics.yaw,
    );
    this.state.phase = 'playing';
    this.safeTrail = [];
    this.safeTrailTimer = 0;
    this.syncPlayerRoot(0);
    this.cameraController.snapBehind(this.makeCameraView());
    this.ui.toast(t('toast.recover'), '↻', 1500);
    this.updateHud();
  }

  private finishRun(victory: boolean, reason: string): void {
    if (this.state.phase === 'finished' || this.state.phase === 'gameover') return;
    this.state.phase = victory ? 'finished' : 'gameover';
    this.state.finishTime = this.state.runTime;
    if (victory) {
      this.score.finish(
        this.state.runTime,
        this.state.health,
        this.state.crashes,
        this.collectibles.total,
      );
      this.particles.checkpoint(
        this.level.pointAt(this.level.data.finishZ, 0).setY(2.0),
      );
      gameAudio.finish();
    } else {
      gameAudio.gameOver();
    }
    this.physics.speed = 0;
    const newBest = this.score.recordRun(this.score.score, this.state.runTime, victory);
    const result: RunResult = {
      victory,
      score: this.score.score,
      fish: this.score.fish,
      totalFish: this.collectibles.total,
      time: this.state.runTime,
      crashes: this.state.crashes,
      distance: this.state.distance,
      reason,
      newBest,
    };
    this.ui.hideJumpPrompts();
    this.ui.clearCountdown();
    this.ui.showResult(result);
    this.ui.updateBest(this.score.bestScore, this.score.bestTime);
    this.cameraController.triggerShake(victory ? 0.02 : 0.04, 0.3);
  }

  private pauseGame(): void {
    if (this.state.phase !== 'playing') return;
    this.state.phase = 'paused';
    this.ui.showPause();
  }

  private resumeGame(): void {
    if (this.state.phase !== 'paused') return;
    this.state.phase = 'playing';
    this.ui.hidePause();
    this.input.endFrame();
  }

  private enterMenu(): void {
    this.state.phase = 'menu';
    this.state.resetRun();
    this.state.health = START_HEARTS;
    this.score.reset();
    this.collectibles.reset();
    this.physics.resetAt(
      this.level.centerX(this.level.data.startZ),
      this.level.data.startZ,
      this.level.startYaw(),
    );
    this.physics.setRespawnPoint(
      this.level.centerX(this.level.data.startZ),
      this.level.data.startZ,
      this.level.startYaw(),
    );
    this.safeTrail = [];
    this.safeTrailTimer = 0;
    this.currentGround = 0.04;
    this.suspension = 0;
    this.pitch = 0;
    this.countdownRemaining = 0;
    this.crashTimer = 0;
    this.crashProgress = 0;
    this.pendingRecovery = null;
    this.leanGroup.rotation.set(0, 0, 0);
    this.syncPlayerRoot(0);
    this.riding.updateIdle(this.visualTime, 1 / 60);
    this.cameraController.setMode('chase');
    this.cameraController.resetForMenu();
    this.ui.showMenu(this.score.bestScore, this.score.bestTime);
  }

  private updateWarnings(): void {
    const gap = this.level.gapAhead(this.physics.position.z, 26);
    const highFish = this.collectibles.nearestHighFishAhead(this.physics.position.z, 16);
    const approachingGap =
      gap !== undefined &&
      this.physics.grounded &&
      !this.level.bridgeAt(this.physics.position.z);
    const approachingHighFish =
      !approachingGap &&
      highFish !== null &&
      this.physics.grounded;
    this.gapWarning = approachingGap;
    this.fishWarning = approachingHighFish;
  }

  private makeCameraView(): CameraView {
    this.cameraView.position.copy(this.playerRoot.position);
    this.cameraView.yaw = this.physics.yaw;
    this.cameraView.speed = this.physics.speed;
    this.cameraView.verticalHeight = this.physics.height;
    this.cameraView.grounded = this.physics.grounded;
    this.cameraView.lean = this.physics.lean;
    return this.cameraView;
  }

  private syncPlayerRoot(_dt: number): void {
    this.leanGroup.rotation.set(0, 0, 0);
    this.playerRoot.position.set(
      this.physics.position.x,
      this.currentGround + this.physics.height,
      this.physics.position.z,
    );
    this.playerRoot.rotation.y = this.physics.yaw;
  }

  private updateMenu(dt: number): void {
    this.syncPlayerRoot(0);
    this.riding.updateIdle(this.visualTime, dt);
    this.cameraController.updateMenu(dt, {
      position: this.playerRoot.position,
      time: this.visualTime,
    });
  }

  private handleGlobalInput(): void {
    if (this.input.consume('pause')) {
      if (this.state.phase === 'playing') {
        gameAudio.uiClick();
        this.pauseGame();
      } else if (this.state.phase === 'paused') {
        gameAudio.uiClick();
        this.resumeGame();
      }
    }
    if (this.input.consume('restart')) {
      if (this.state.phase !== 'menu') {
        gameAudio.uiClick();
        this.startNewRun();
      }
    }
    if (this.input.consume('camera')) {
      if (this.state.phase === 'playing' || this.state.phase === 'countdown') {
        gameAudio.uiClick();
        this.cameraController.cycleMode();
        this.ui.toast(this.getCameraLabel(), '◉', 950);
      }
    }
    if (this.input.consume('mute')) {
      gameAudio.unlock();
      gameAudio.uiClick();
      const muted = gameAudio.toggleMuted();
      if (
        this.state.phase === 'playing' ||
        this.state.phase === 'paused' ||
        this.state.phase === 'countdown' ||
        this.state.phase === 'crashed'
      ) {
        this.ui.toast(
          t(muted ? 'toast.soundOff' : 'toast.soundOn'),
          muted ? '♪' : '♫',
          1100,
        );
      }
    }
  }

  private readonly frame = (dt: number, _elapsed: number): void => {
    if (this.disposed) return;
    this.visualTime += dt;
    this.handleGlobalInput();
    const phase = this.state.phase;

    switch (phase) {
      case 'menu':
        this.updateMenu(dt);
        break;
      case 'countdown':
        this.updateCountdown(dt);
        break;
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'crashed':
        this.updateCrash(dt);
        break;
      case 'paused':
        break;
      case 'finished':
      case 'gameover':
        break;
    }

    gameAudio.update(dt, this.physics.speed, this.physics.grounded, phase);
    this.collectibles.update(dt, this.visualTime);
    this.environment.update(dt, this.visualTime, this.camera.position);
    this.world.update(dt, this.visualTime);
    this.particles.update(dt);
    this.lighting.update(this.playerRoot.position);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();

    if (!this.loadingHidden) {
      this.loadingHidden = true;
      this.ui.hideLoading();
    }
  };

  private installDebugApi(): void {
    const api: PelicanRiderDebugApi = {
      startRun: () => {
        this.startNewRun();
      },
      skipCountdown: () => {
        if (this.state.phase === 'countdown') {
          this.countdownRemaining = 0.001;
          this.lastCountdownDigit = 1;
        }
      },
      getDebugState: () => ({
        phase: this.state.phase,
        position: this.debugView,
        speed: this.physics.speed,
        speedKmh: this.physics.speed * 3.6,
        health: this.state.health,
        score: this.score.score,
        fish: this.score.fish,
        fishRemaining: this.collectibles.remaining,
        progress: this.level.progressForZ(this.physics.position.z),
        runTime: this.state.runTime,
        countdown: this.countdownRemaining,
        cameraMode: this.cameraController.mode,
        stats: this.loop.getStats(),
      }),
      teleportNearFinish: () => {
        if (this.state.phase === 'menu') {
          this.startNewRun();
          this.countdownRemaining = 0.001;
          this.state.phase = 'playing';
          this.ui.clearCountdown();
        }
        const z = this.level.data.finishZ - 8;
        const point = this.level.pointAt(z, 0);
        this.physics.placeAt(point.x, z, this.level.yawAt(z));
        this.physics.speed = 3.5;
        this.state.phase = 'playing';
        this.syncPlayerRoot(0);
        this.cameraController.snapBehind(this.makeCameraView());
      },
    };
    window.__pelicanRider = api;
    (window as unknown as { __pelicanGame?: Game }).__pelicanGame = this;
    // Keep the debug view object in sync without allocating a new object every
    // time getDebugState is called.
    const originalGet = api.getDebugState;
    api.getDebugState = () => {
      this.debugView.x = this.playerRoot.position.x;
      this.debugView.y = this.playerRoot.position.y;
      this.debugView.z = this.playerRoot.position.z;
      return originalGet.call(api);
    };
  }

  private describeCrash(reason: CrashReason): string {
    switch (reason) {
      case 'rock':
        return t('crash.rock');
      case 'log':
        return t('crash.log');
      case 'driftwood':
        return t('crash.driftwood');
      case 'gap':
        return t('crash.gap');
      case 'offroad':
        return t('crash.offroad');
      default:
        return t('crash.default');
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.unsubscribeLocale?.();
    this.input.dispose();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.environment.dispose();
    this.world.dispose();
    this.collectibles.dispose();
    this.obstacles.dispose();
    this.particles.dispose();
    this.pelican.dispose();
    this.renderer.dispose();
    delete window.__pelicanRider;
  }
}
