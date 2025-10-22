import { Routes } from '@angular/router';
import { LobbyComponent } from './lobby/lobby.component';
import { WaitingRoomComponent } from './waiting-room/waiting-room.component';
import { GameComponent } from './game/game.component';
import { TariboLobbyComponent } from './taribo-lobby/taribo-lobby.component';
import { TariboWaitingRoomComponent } from './taribo-waiting-room/taribo-waiting-room.component';
import { TariboGameComponent } from './taribo-game/taribo-game.component';

export const routes: Routes = [
  { path: '', component: LobbyComponent },
  { path: 'waiting/:code', component: WaitingRoomComponent },
  { path: 'game/:code', component: GameComponent },
  { path: 'taribo', component: TariboLobbyComponent },
  { path: 'taribo/waiting/:code', component: TariboWaitingRoomComponent },
  { path: 'taribo/game/:code', component: TariboGameComponent },
  { path: '**', redirectTo: '' }
];