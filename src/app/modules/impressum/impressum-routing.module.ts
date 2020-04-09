import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ImpressumComponent } from './pages/impressum/impressum.component';

const routes: Routes = [
  {
    path: '',
    component: ImpressumComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ImpressumRoutingModule {}
