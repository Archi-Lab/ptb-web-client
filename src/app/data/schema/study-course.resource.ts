import { Observable } from 'rxjs';
import { CustomResource } from './custom-resource.resource';
import { Module } from './module.resource';

export class StudyCourse extends CustomResource {
  id: string;
  name: string;
  academicDegree: string;
  modules: Module[];

  getStudyDirections(): Observable<StudyCourse[]> {
    return this.getRelationArray(StudyCourse, 'studyDirections');
  }

  getModules(): Observable<Module[]> {
    // THIS DOES NOT WORK
    // There is a bug that appends a slash between the URL and the params
    // when you call getRelationArray with HalOptions
    // let options: HalOptions = {sort: [{path: 'name', order: 'ASC'}]};
    // return this.getRelationArray(Module, 'modules', undefined, options);
    return this.getRelationArray(Module, 'modules');
  }

  getAndSetModuleArray(): Promise<Module[]> {
    return new Promise<Module[]>((resolve, reject) => {
      this.getModules().subscribe(
        tmpModules => (this.modules = tmpModules),
        () => reject(),
        () => {
          this.modules.sort((a, b) => {
            if (a.name < b.name) {
              return -1;
            }
            if (a.name > b.name) {
              return 1;
            }
            return 0;
          });
          resolve(this.modules);
        }
      );
    });
  }

  getParentStudyCourse(): Observable<StudyCourse> {
    return this.getRelation(StudyCourse, 'parentStudyCourse');
  }
}