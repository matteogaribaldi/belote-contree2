import { Routes } from '@angular/router';
import { LobbyComponent } from './lobby/lobby.component';
import { WaitingRoomComponent } from './waiting-room/waiting-room.component';
import { GameComponent } from './game/game.component';

export const routes: Routes = [
  { path: '', component: LobbyComponent },
  { path: 'waiting/:code', component: WaitingRoomComponent },
  { path: 'game/:code', component: GameComponent },
  { path: '**', redirectTo: '' }
];