/**
 * HUD — Minimal arena overlay.
 * Shows army sizes, match timer, formation indicator, and notifications.
 */

import type { World, WarbandMemberC, BannerLeaderC, TransformC, CrownBearerC, TeamC } from '@crownfall/game-core';
import { CK } from '@crownfall/game-core';

export class HUD {
  private element: HTMLElement;
  private playerArmyEl!: HTMLElement;
  private enemyArmyEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private formationEl!: HTMLElement;
  private notifEl!: HTMLElement;
  private onboardingEl!: HTMLElement;
  private crownsEl!: HTMLElement;
  private onboardingStep = 0;
  private onboardingTimer = 0;

  constructor(
    parent: HTMLElement,
    private world: World,
    private playerTeamId: number,
  ) {
    this.element = document.createElement('div');
    this.element.id = 'game-hud';
    this.element.innerHTML = `
            <div class="hud-arena-top">
                <div class="army-panel army-player">
                    <span class="army-label">YOU</span>
                    <span class="army-count" id="player-army-count">5</span>
                    <span class="army-crowns" id="player-crowns"></span>
                </div>
                <div class="vs-badge">⚔</div>
                <div class="army-panel army-enemy">
                    <span class="army-count" id="enemy-army-count">5</span>
                    <span class="army-label">ENEMY</span>
                </div>
            </div>
            <div class="hud-timer" id="match-timer">5:00</div>
            <div class="hud-formation" id="formation-indicator">
                <span class="form-btn active" data-f="column">I</span>
                <span class="form-btn" data-f="line">III</span>
                <span class="form-btn" data-f="wedge">V</span>
            </div>
            <div class="hud-notifs" id="hud-notifs"></div>
            <div class="hud-onboarding" id="hud-onboarding"></div>
        `;
    parent.appendChild(this.element);

    this.playerArmyEl = this.element.querySelector('#player-army-count')!;
    this.enemyArmyEl = this.element.querySelector('#enemy-army-count')!;
    this.timerEl = this.element.querySelector('#match-timer')!;
    this.formationEl = this.element.querySelector('#formation-indicator')!;
    this.notifEl = this.element.querySelector('#hud-notifs')!;
    this.onboardingEl = this.element.querySelector('#hud-onboarding')!;
    this.crownsEl = this.element.querySelector('#player-crowns')!;

    this.setupEvents();
  }

  private setupEvents(): void {
    // Formation changed
    this.world.events.on('warband:formation_changed', (ev: any) => {
      if (ev.teamId === this.playerTeamId) {
        this.updateFormationIndicator(ev.formationType);
      }
    });

    // Shard collected
    this.world.events.on('shard:collected', () => {
      // Brief flash on army count
      this.playerArmyEl.classList.add('flash');
      setTimeout(() => this.playerArmyEl.classList.remove('flash'), 300);
    });

    // Crown events
    this.world.events.on('crown:picked_up', (ev: any) => {
      this.showNotif('👑 Crown claimed!');
    });

    this.world.events.on('army:absorbed', (ev: any) => {
      this.showNotif(`+${ev.warriorsGained} warriors absorbed`);
    });

    this.world.events.on('leader:killed', (ev: any) => {
      if (ev.killedByTeamId === this.playerTeamId) {
        this.showNotif('Enemy leader slain!');
      }
    });
  }

  update(world: World, playerTeamId: number, _aiTeamId: number, playerLeaderId: number): void {
    // Count armies
    const members = world.getStore<WarbandMemberC>(CK.WarbandMember);
    const leaders = world.getStore<BannerLeaderC>(CK.BannerLeader);
    let playerCount = 0;
    let totalEnemyCount = 0;
    let rivalLeaders = 0;
    for (const [, m] of members.entries()) {
      if (m.teamId === playerTeamId && m.leaderId !== 0) playerCount++;
      else if (m.teamId !== playerTeamId && m.leaderId !== 0) totalEnemyCount++;
    }

    // Count alive rival leaders
    for (const [lid] of leaders.entries()) {
      const team = world.getStore<TeamC>(CK.Team).get(lid);
      if (team && team.teamId !== playerTeamId) rivalLeaders++;
    }

    this.playerArmyEl.textContent = String(playerCount);
    this.enemyArmyEl.textContent = `${totalEnemyCount} (${rivalLeaders} rivals)`;

    // Color based on comparison
    if (playerCount > totalEnemyCount) {
      this.playerArmyEl.style.color = '#4CAF50';
      this.enemyArmyEl.style.color = '#F44336';
    } else if (playerCount < totalEnemyCount) {
      this.playerArmyEl.style.color = '#F44336';
      this.enemyArmyEl.style.color = '#4CAF50';
    } else {
      this.playerArmyEl.style.color = '#FFD700';
      this.enemyArmyEl.style.color = '#FFD700';
    }

    // Crowns
    const bearers = world.getStore<CrownBearerC>(CK.CrownBearer);
    const bearer = bearers.get(playerLeaderId);
    if (bearer && bearer.crownsCollected > 0) {
      this.crownsEl.textContent = '👑'.repeat(bearer.crownsCollected);
    } else {
      this.crownsEl.textContent = '';
    }

    // Timer
    const remaining = Math.max(0, 300 - world.matchTime);
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    this.timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Onboarding
    this.updateOnboarding(world, playerCount);
  }

  private updateOnboarding(world: World, armySize: number): void {
    this.onboardingTimer++;

    if (this.onboardingStep === 0 && this.onboardingTimer > 20) {
      this.onboardingEl.innerHTML = '<div class="onboard-tip">Move toward the <span class="highlight">blue orbs</span> to grow your warband</div>';
      this.onboardingStep = 1;
    }

    if (this.onboardingStep === 1 && armySize > 8) {
      this.onboardingEl.innerHTML = '<div class="onboard-tip">Warriors fight <span class="highlight">automatically</span> — move to position them</div>';
      this.onboardingStep = 2;
      setTimeout(() => {
        if (this.onboardingStep === 2) {
          this.onboardingEl.innerHTML = '<div class="onboard-tip">Press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> to change formation</div>';
          this.onboardingStep = 3;
        }
      }, 5000);
    }

    if (this.onboardingStep === 3 && this.onboardingTimer > 300) {
      this.onboardingEl.innerHTML = '';
      this.onboardingStep = 99;
    }
  }

  private updateFormationIndicator(formation: string): void {
    const btns = this.formationEl.querySelectorAll('.form-btn');
    btns.forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.f === formation);
    });
  }

  private showNotif(text: string): void {
    const el = document.createElement('div');
    el.className = 'notif';
    el.textContent = text;
    this.notifEl.appendChild(el);

    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, 2500);
  }

  dispose(): void {
    this.element.remove();
  }
}
