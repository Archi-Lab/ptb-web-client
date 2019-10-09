import { UUID } from 'angular2-uuid';
import { Module } from './module.resource';
import { Observable } from 'rxjs';
import { CustomResource } from './custom-resource';
import { ArchivedProposal } from './archived-proposal.resource';

export class Proposal extends CustomResource {
  id: UUID;
  content: string;
  projectId: UUID;
  supervisorId: UUID;
  studentId: UUID;
  version: number;
  created: Date;
  modified: Date;
  lastUpdateBy: string;
  studentPermitsPublish: boolean;
  supervisorPermitsPublish: boolean;
  archivedProposal: ArchivedProposal[];

  isPublished(): boolean {
    return this.supervisorPermitsPublish && this.studentPermitsPublish;
  }
}