import { expect, test, type Page } from '@playwright/test';

interface SteeringState {
  phase: string;
  yaw: number;
  x: number;
  z: number;
  steerInput: number;
  steerAngle: number;
  lean: number;
  frontPivot: number;
  bodyRoll: number;
  leanGroup: number;
  cameraMode: string;
  cameraRightX: number;
  cameraRightZ: number;
  wingLeftError: number;
  wingRightError: number;
}

async function steeringState(page: Page): Promise<SteeringState> {
  return page.evaluate(() => {
    const game = (window as unknown as {
      __pelicanGame: {
        state: { phase: string };
        physics: {
          yaw: number;
          position: { x: number; z: number };
          steerInput: number;
          steerAngle: number;
          lean: number;
        };
        playerRoot: { position: { clone: () => import('three').Vector3 } };
        bicycle: { getSteeringPivot: () => { rotation: { y: number } } };
        pelican: {
          bodyRig: { rotation: { z: number } };
          wingRigs: {
            left: { hand: { getWorldPosition: (out: import('three').Vector3) => void } };
            right: { hand: { getWorldPosition: (out: import('three').Vector3) => void } };
          };
        };
        riding: {
          getGripWorldPositions: () => {
            left: import('three').Vector3;
            right: import('three').Vector3;
          };
        };
        leanGroup: { rotation: { z: number } };
        cameraController: { mode: string };
        camera: import('three').Camera;
      };
    }).__pelicanGame;
    const p = game.playerRoot.position.clone();
    const cameraRight = p.clone();
    const yaw = game.physics.yaw;
    game.camera.updateMatrixWorld(true);
    cameraRight.setFromMatrixColumn(game.camera.matrixWorld, 0);
    const grips = game.riding.getGripWorldPositions();
    const leftHand = grips.left.clone();
    const rightHand = grips.right.clone();
    game.pelican.wingRigs.left.hand.getWorldPosition(leftHand);
    game.pelican.wingRigs.right.hand.getWorldPosition(rightHand);
    return {
      phase: game.state.phase,
      yaw,
      x: game.physics.position.x,
      z: game.physics.position.z,
      steerInput: game.physics.steerInput,
      steerAngle: game.physics.steerAngle,
      lean: game.physics.lean,
      frontPivot: game.bicycle.getSteeringPivot().rotation.y,
      bodyRoll: game.pelican.bodyRig.rotation.z,
      leanGroup: game.leanGroup.rotation.z,
      cameraMode: game.cameraController.mode,
      cameraRightX: cameraRight.x,
      cameraRightZ: cameraRight.z,
      wingLeftError: leftHand.distanceTo(grips.left),
      wingRightError: rightHand.distanceTo(grips.right),
    };
  });
}

async function beginRide(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __pelicanRider: { startRun: () => void } }).__pelicanRider.startRun();
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    (window as unknown as { __pelicanRider: { skipCountdown: () => void } }).__pelicanRider.skipCountdown();
  });
  await expect
    .poll(async () => steeringState(page).then((state) => state.phase), { timeout: 5_000 })
    .toBe('playing');
}

async function steer(
  page: Page,
  key: 'a' | 'd',
  cameraTaps = 0,
): Promise<{ before: SteeringState; after: SteeringState }> {
  await beginRide(page);
  for (let i = 0; i < cameraTaps; i += 1) {
    await page.keyboard.press('c');
    await page.waitForTimeout(120);
  }
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  const before = await steeringState(page);
  await page.keyboard.down(key);
  await page.waitForTimeout(900);
  const after = await steeringState(page);
  await page.keyboard.up(key);
  await page.keyboard.up('w');
  return { before, after };
}

test('A and D steer left/right consistently in world and screen space', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');
  await expect(page.locator('#menu-screen')).toHaveClass(/is-visible/);

  const left = await steer(page, 'a');
  expect(left.before.cameraMode).toBe('chase');
  expect(left.after.yaw).toBeGreaterThan(left.before.yaw);
  expect(left.after.frontPivot).toBeGreaterThan(0);
  expect(left.after.steerAngle).toBeGreaterThan(0);
  expect(left.after.lean).toBeLessThan(0);
  expect(left.after.leanGroup).toBeLessThan(0);
  expect(left.after.bodyRoll).toBeLessThan(left.before.bodyRoll);
  const leftScreenDelta =
    (left.after.x - left.before.x) * left.before.cameraRightX +
    (left.after.z - left.before.z) * left.before.cameraRightZ;
  expect(leftScreenDelta).toBeLessThan(0);
  expect(left.after.wingLeftError).toBeLessThan(0.03);
  expect(left.after.wingRightError).toBeLessThan(0.03);

  const right = await steer(page, 'd');
  expect(right.after.yaw).toBeLessThan(right.before.yaw);
  expect(right.after.frontPivot).toBeLessThan(0);
  expect(right.after.steerAngle).toBeLessThan(0);
  expect(right.after.lean).toBeGreaterThan(0);
  expect(right.after.leanGroup).toBeGreaterThan(0);
  expect(right.after.bodyRoll).toBeGreaterThan(right.before.bodyRoll);
  const rightScreenDelta =
    (right.after.x - right.before.x) * right.before.cameraRightX +
    (right.after.z - right.before.z) * right.before.cameraRightZ;
  expect(rightScreenDelta).toBeGreaterThan(0);
  expect(right.after.wingLeftError).toBeLessThan(0.03);
  expect(right.after.wingRightError).toBeLessThan(0.03);

  expect(errors).toEqual([]);
});

test('camera modes do not change steering semantics, and pause/restart work', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');

  const close = await steer(page, 'a', 1);
  expect(close.after.cameraMode).toBe('close');
  expect(close.after.yaw).toBeGreaterThan(close.before.yaw);
  expect(close.after.frontPivot).toBeGreaterThan(0);

  const coast = await steer(page, 'd', 2);
  expect(coast.after.cameraMode).toBe('coast');
  expect(coast.after.yaw).toBeLessThan(coast.before.yaw);
  expect(coast.after.frontPivot).toBeLessThan(0);

  await beginRide(page);
  await page.keyboard.press('p');
  await expect(page.locator('#pause-screen')).toHaveClass(/is-visible/);
  await page.keyboard.press('p');
  await expect(page.locator('#pause-screen')).not.toHaveClass(/is-visible/);
  await page.keyboard.press('r');
  await expect
    .poll(async () => steeringState(page).then((state) => state.phase), { timeout: 5_000 })
    .toBe('countdown');
  expect(errors).toEqual([]);
});
