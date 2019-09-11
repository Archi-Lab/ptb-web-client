import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { Component, Inject, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { MatChipInputEvent, MatDialogRef, MatSnackBar, MAT_DIALOG_DATA } from '@angular/material';
import { ProjectService } from '@prox/core/services/project.service';
import { TagService } from '@prox/core/services/tag.service';
import { KeyCloakUser } from '@prox/keycloak/KeyCloakUser';
import { StudyCourse, Tag } from '@prox/shared/hal-resources';
import { Module } from '@prox/shared/hal-resources/module.resource';
import { Project } from '@prox/shared/hal-resources/project.resource';
import { forkJoin, Observable, Observer } from 'rxjs';
import { map } from 'rxjs/operators';
import * as _ from 'underscore';
import { StudyCourseModuleSelectionModel } from '../study-course-module-selection/study-course-module-selection.component';

@Component({
  selector: 'app-project-dialog',
  templateUrl: './project-dialog.component.html',
  styleUrls: ['./project-dialog.component.scss']
})
export class ProjectDialogComponent implements OnInit {
  projectFormControl: FormGroup;
  hasSubmitted: boolean = false;

  tags: Tag[] = [];
  readonly separatorKeysCodes: number[] = [ENTER, COMMA];

  constructor(
    public projectDialogRef: MatDialogRef<ProjectDialogComponent>,
    private projectService: ProjectService,
    private tagService: TagService,
    private formBuilder: FormBuilder,
    private snack: MatSnackBar,
    private user: KeyCloakUser,
    @Inject(MAT_DIALOG_DATA) public project: Project
  ) {}

  ngOnInit() {
    this.projectFormControl = this.formBuilder.group({
      name: ['', [Validators.required]],
      shortDescription: ['', [Validators.required]],
      requirement: [''],
      description: ['', [Validators.required]],
      supervisorName: ['', [Validators.required]],
      status: ['', [Validators.required]],
      studyCoursesModuleSelectors: this.formBuilder.array([])
    });

    /* TODO:
      - fill in existing !?
      - add tags support
        - adding (check & add)
        - fill in existing
      - '+' button layout
      - image & text for wiki

      - option to set all / profiles !??
      - stepps?
      - responsive design?
      - FONTS LOCAL !
    */

    this.addStudyCourseModuleSelector();

    if (this.project) {
      this.fillInExistingProjectValues();
    }
  }

  closeDialog() {
    this.projectDialogRef.close();
  }

  get moduleSelectors(): FormArray {
    return this.projectFormControl.get('studyCoursesModuleSelectors') as FormArray;
  }

  addStudyCourseModuleSelector() {
    this.moduleSelectors.push(new FormControl());
  }

  removeStudyCourseModuleSelector(index: number) {
    this.moduleSelectors.removeAt(index);
    if (this.moduleSelectors.length < 1) {
      this.addStudyCourseModuleSelector();
    }
  }

  addTag(event: MatChipInputEvent) {
    const input = event.input;
    const value = event.value;

    if ((value || '').trim()) {
      let tag = new Tag();
      tag.tagName = value.trim();
      this.tags.push(tag);
    }

    if (input) {
      input.value = '';
    }
  }

  removeTag(tag: Tag) {
    const index = this.tags.indexOf(tag);
    if (index >= 0) {
      this.tags.splice(index, 1);
    }
  }

  private getAggregatedSelectedModules() {
    return _.chain(this.moduleSelectors.getRawValue())
      .pluck('selectedModules')
      .flatten()
      .uniq(x => x.id)
      .value();
  }

  private prepareStudyCourseSelectorData(
    modules: Module[]
  ): Observable<StudyCourseModuleSelectionModel[]> {
    return Observable.create((observer: Observer<StudyCourseModuleSelectionModel[]>) => {
      let observables = [];

      for (let index = 0; index < modules.length; index++) {
        observables.push(
          modules[index].getRelation(StudyCourse, 'studyCourse').pipe(
            map(course => {
              return { module: modules[index], studyCourse: course };
            })
          )
        );
      }

      forkJoin(observables).subscribe(
        success => {
          let result = _.chain(success)
            .groupBy(element => element.studyCourse.id)
            .map(element => element)
            .map(element => {
              return new StudyCourseModuleSelectionModel(
                element[0].studyCourse,
                element.map(x => x.module)
              );
            })
            .value();
          observer.next(result);
          observer.complete();
        },
        error => {
          this.showSubmitInfo('Fehler beim parsen der Module');
          this.closeDialog();
          console.log(error);
          observer.complete();
        }
      );
    });
  }

  private fillInExistingProjectValues() {
    this.projectFormControl.controls.name.setValue(this.project.name);
    this.projectFormControl.controls.shortDescription.setValue(this.project.shortDescription);
    this.projectFormControl.controls.requirement.setValue(this.project.requirement);
    this.projectFormControl.controls.description.setValue(this.project.description);
    this.projectFormControl.controls.supervisorName.setValue(this.project.supervisorName);
    this.projectFormControl.controls.status.setValue(this.project.status);

    this.project.getModules().subscribe(modules =>
      this.prepareStudyCourseSelectorData(modules).subscribe(success => {
        if (success.length >= 1) {
          this.moduleSelectors.controls[0].setValue(success[0]);
        }
        for (let index = 1; index < success.length; index++) {
          this.addStudyCourseModuleSelector();
          this.moduleSelectors.controls[index].setValue(success[index]);
        }
      })
    );

    // fill in tags
  }

  private createTags(tags: Tag[]): Observable<Tag[]> {
    // check if Tag exists, only create non existing
    // then merge and return results

    return Observable.create((observer: Observer<Tag[]>) => {
      let observables = tags.map(tag => this.tagService.create(tag));
      forkJoin(observables).subscribe(
        success => {
          observer.next(success as Tag[]);
          observer.complete();
        },
        error => {
          this.showSubmitInfo('Fehler beim anlegen der Tags');
          this.closeDialog();
          console.log(error);
          observer.complete();
        }
      );
    });
  }

  private createProjectResource(project: Project): Project {
    let projectResource: Project;
    if (this.project) {
      projectResource = this.project;
    } else {
      projectResource = new Project();
    }

    projectResource.creatorID = this.user.getID();
    projectResource.creatorName = this.user.getFullName();

    projectResource.shortDescription = project.shortDescription;
    projectResource.requirement = project.requirement;
    projectResource.description = project.description;
    projectResource.name = project.name;
    projectResource.status = project.status;

    if (project.supervisorName.length == 0) {
      projectResource.supervisorName = projectResource.creatorName;
    } else {
      projectResource.supervisorName = project.supervisorName;
    }

    return projectResource;
  }

  private createProject(project: Project, modules: Module[]) {
    let newProject = this.createProjectResource(project);

    // Create Project
    this.projectService.create(newProject).subscribe(
      () => {
        newProject.setModules(modules).then(
          () => {
            this.showSubmitInfo('Projekt wurde erfolgreich erstellt');
            this.closeDialog();
          },
          error => {
            this.showSubmitInfo('Fehler beim Verknüpfen der Module');
            this.closeDialog();
            console.log(error);
          }
        );
      },
      error => {
        this.showSubmitInfo('Fehler beim Bearbeiten der Anfrage');
        this.hasSubmitted = false;
        console.log(error);
      }
    );
  }

  private updateProject(project: Project, modules: Module[]) {
    this.project = this.createProjectResource(project);

    // Update Project
    this.projectService.update(this.project).subscribe(
      () => {
        this.project.setModules(modules).then(
          () => {
            this.showSubmitInfo('Projekt wurde erfolgreich bearbeitet');
            this.closeDialog();
          },
          error => {
            this.showSubmitInfo('Fehler beim Verknüpfen der Module');
            this.closeDialog();
            console.log(error);
          }
        );
      },
      error => {
        this.showSubmitInfo('Fehler beim Bearbeiten der Anfrage');
        this.hasSubmitted = false;
        console.log(error);
      }
    );
  }

  onSubmit(project: Project) {
    this.hasSubmitted = true;

    this.createTags(this.tags);
    // ????

    if (this.project) {
      this.updateProject(project, this.getAggregatedSelectedModules());
    } else {
      this.createProject(project, this.getAggregatedSelectedModules());
    }
  }

  private showSubmitInfo(message: string) {
    this.snack.open(message, null, {
      duration: 2000
    });
  }
}
