import { Observable } from 'rxjs';
import { CustomResource } from './custom-resource.resource';
import { Module } from './module.resource';
import { Tag } from './tag.resource';

export class Project extends CustomResource {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  status: string;
  creatorID: string;
  creatorName: string;
  supervisorName: string;
  requirement: string;

  setModules(newModules: Module[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.setRelationArray('modules', newModules).subscribe(
        () => {},
        error => reject(error),
        () => resolve()
      );
    });
  }

  setTags(tags: Tag[]) {
    this.setRelationArray('tagCollection', tags).subscribe();
  }

  getModules(): Observable<Module[]> {
    return this.getRelationArray(Module, 'modules');
  }

  getTags(): Observable<Tag[]> {
    return this.getRelationArray(Tag, 'tagCollection');
  }
}