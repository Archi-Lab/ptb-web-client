import { COMMA, ENTER } from '@angular/cdk/keycodes';
import {
  Component,
  ElementRef,
  EventEmitter,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators
} from '@angular/forms';
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatChipInputEvent,
  MatChipSelectionChange,
  MatSnackBar
} from '@angular/material';
import { StudyCourseModuleSelectionModel } from '@prox/components/study-course-module-selection';
import {
  ProjectService,
  TagService,
  KeyCloakUserService
} from '@prox/core/services';
import { Module, Project, StudyCourse, Tag } from '@prox/shared/hal-resources';
import {
  forkJoin,
  interval,
  Observable,
  Observer,
  of,
  Subscription
} from 'rxjs';
import {
  debounceTime,
  filter,
  map,
  mergeMap,
  skip,
  switchMap,
  takeUntil,
  toArray
} from 'rxjs/operators';
import * as _ from 'underscore';
import { LOCAL_STORAGE, StorageService } from 'ngx-webstorage-service';

@Component({
  selector: 'prox-project-editor',
  templateUrl: './project-editor.component.html',
  styleUrls: ['./project-editor.component.scss']
})
export class ProjectEditorComponent implements OnInit, OnDestroy {
  private STORAGE_KEY = 'project-editor-state';

  @Input() project?: Project;
  @Output() projectSaved = new EventEmitter<Project>();
  @Output() cancel = new EventEmitter<any>();

  projectFormControl: FormGroup;
  hasSubmitted: boolean = false;

  tags: Tag[] = [];
  filteredTags: Observable<Tag[]>;
  readonly separatorKeysCodes: number[] = [ENTER, COMMA];
  recommendedTags: Tag[] = [];

  @ViewChild('tagInput') tagInput: ElementRef<HTMLInputElement>;
  @ViewChild('tagAuto') tagAutocomplete: MatAutocomplete;

  autoSave: Subscription;

  constructor(
    private projectService: ProjectService,
    private tagService: TagService,
    private formBuilder: FormBuilder,
    private snack: MatSnackBar,
    private user: KeyCloakUserService,
    @Inject(LOCAL_STORAGE) private storage: StorageService
  ) {}

  ngOnInit() {
    this.projectFormControl = this.formBuilder.group({
      name: ['', [Validators.required]],
      shortDescription: ['', [Validators.required]],
      requirement: [''],
      description: ['', [Validators.required]],
      supervisorName: ['', [Validators.required]],
      status: ['', [Validators.required]],
      studyCoursesModuleSelectors: this.formBuilder.array([]),
      tagInput: []
    });

    this.filteredTags = this.projectFormControl.controls.tagInput.valueChanges.pipe(
      filter(value => value.length >= 2),
      debounceTime(200),
      switchMap(value =>
        this.tagService
          .findByTagName(value, false)
          .pipe(
            takeUntil(
              this.projectFormControl.controls.tagInput.valueChanges.pipe(
                skip(1)
              )
            )
          )
      )
    );

    this.addStudyCourseModuleSelector();

    if (this.project) {
      this.clearStorage();
      this.fillInExistingProjectValues();
    } else {
      this.tryLoadState();
      this.enableAutosave();
    }
  }

  enableAutosave() {
    const source = interval(5000);
    this.autoSave = source.subscribe(() => {
      this.saveState();
      console.log('Autosaving Project-Editor Data...');
    });
  }

  ngOnDestroy() {
    this.autoSave.unsubscribe();
  }

  saveState() {
    const state = this.projectFormControl.getRawValue();
    state.tags = this.tags;
    console.log(state);
    this.storage.set(this.STORAGE_KEY, JSON.stringify(state));
  }

  tryLoadState() {
    let data = this.storage.get(this.STORAGE_KEY);
    if (data) {
      let state = JSON.parse(data);
      console.log(state);

      let modules = state.studyCoursesModuleSelectors;

      this.tags = state.tags;
      this.updateTagRecommendations();

      delete state.tags;
      delete state.studyCoursesModuleSelectors;

      this.projectFormControl.patchValue(state);

      let createStudyCourse = function(data: any): StudyCourse {
        let studyCourse = new StudyCourse();
        studyCourse.id = data.id;
        studyCourse.name = data.name;
        studyCourse.academicDegree = data.academicDegree;
        studyCourse._links = data._links;
        return studyCourse;
      };

      let createModuleModel = function(data: any): Module {
        let mod = new Module();
        mod.id = data.id;
        mod.name = data.name;
        mod.projectType = data.projectType;
        mod._links = data._links;
        return mod;
      };

      let createModuleSelectorModel = function(
        data: any
      ): StudyCourseModuleSelectionModel {
        let selectedModules: Module[] = [];
        for (let index = 0; index < data.selectedModules.length; index++) {
          selectedModules.push(createModuleModel(data.selectedModules[index]));
        }
        return new StudyCourseModuleSelectionModel(
          createStudyCourse(data.studyCourse),
          selectedModules
        );
      };

      if (modules[0] != null) {
        if (modules.length >= 1) {
          this.moduleSelectors.controls[0].setValue(
            createModuleSelectorModel(modules[0])
          );
        }

        for (let index = 1; index < modules.length; index++) {
          this.addStudyCourseModuleSelector();
          this.moduleSelectors.controls[index].setValue(
            createModuleSelectorModel(modules[index])
          );
        }
      }
    }
  }

  clearStorage() {
    this.storage.remove(this.STORAGE_KEY);
  }

  get moduleSelectors(): FormArray {
    return this.projectFormControl.get(
      'studyCoursesModuleSelectors'
    ) as FormArray;
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
    if (!this.tagAutocomplete.isOpen) {
      const input = event.input;
      const value = event.value;

      if ((value || '').trim()) {
        let tag = new Tag();
        tag.tagName = value.trim();
        this.tags.push(tag);
        this.updateTagRecommendations();
      }

      if (input) {
        input.value = '';
      }
    }
  }

  removeTag(tag: Tag) {
    const index = this.tags.indexOf(tag);
    if (index >= 0) {
      this.tags.splice(index, 1);
      this.updateTagRecommendations();
    }
  }

  displayTagName(tag?: Tag): string | undefined {
    return tag ? tag.tagName : undefined;
  }

  recommendedTagSelected(tag: Tag, event: MatChipSelectionChange) {
    if (event.isUserInput) {
      this.addRecommendedTag(tag);
    }
    console.log(event);
  }

  addRecommendedTag(tag: Tag) {
    this.tags.push(tag);
    const index = this.recommendedTags.indexOf(tag);
    if (index != -1) {
      this.recommendedTags.splice(index, 1);
    }
    this.tagService
      .getRecommendations(this.tags)
      .subscribe(tags => (this.recommendedTags = tags));
  }

  updateTagRecommendations() {
    let filteredTags = this.tags.filter(tag => tag.id != null);
    this.tagService
      .getRecommendations(filteredTags)
      .subscribe(tags => (this.recommendedTags = tags));
  }

  selectedTag(event: MatAutocompleteSelectedEvent): void {
    if (event.option.value instanceof Tag) {
      this.tags.push(event.option.value);
      this.updateTagRecommendations();
    }
    this.tagInput.nativeElement.value = '';
    this.projectFormControl.controls.tagInput.setValue(null);
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
    return Observable.create(
      (observer: Observer<StudyCourseModuleSelectionModel[]>) => {
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
            console.log(error);
            observer.complete();
          }
        );
      }
    );
  }

  private fillInExistingProjectValues() {
    this.projectFormControl.controls.name.setValue(this.project.name);
    this.projectFormControl.controls.shortDescription.setValue(
      this.project.shortDescription
    );
    this.projectFormControl.controls.requirement.setValue(
      this.project.requirement
    );
    this.projectFormControl.controls.description.setValue(
      this.project.description
    );
    this.projectFormControl.controls.supervisorName.setValue(
      this.project.supervisorName
    );
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

    this.project.getTags().subscribe(tags => {
      this.tags = tags;
      this.updateTagRecommendations();
    });
  }

  private createTags(tags: Tag[]): any {
    return of(...tags).pipe(
      mergeMap(
        tag => this.tagService.findByTagName(tag.tagName),
        (tagSource, foundTags) => {
          return {
            tagSource: tagSource,
            foundTags: foundTags
          };
        }
      ),
      mergeMap(x => {
        if (x.foundTags.length >= 1) return of(x.foundTags[0]);
        return this.tagService.create(x.tagSource);
      }),
      toArray()
    );
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

  private createProject(project: Project, modules: Module[], tags: Tag[]) {
    let newProject = this.createProjectResource(project);

    // Create Project
    this.projectService.create(newProject).subscribe(
      () => {
        newProject.setTags(tags);
        newProject.setModules(modules).then(
          () => {
            this.showSubmitInfo('Projekt wurde erfolgreich erstellt');
            this.clearStorage();
            this.projectSaved.emit(newProject);
          },
          error => {
            this.showSubmitInfo('Fehler beim Verknüpfen der Module');
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

  private updateProject(project: Project, modules: Module[], tags: Tag[]) {
    this.project = this.createProjectResource(project);

    // Update Project
    this.projectService.update(this.project).subscribe(
      () => {
        this.project.setTags(tags);
        this.project.setModules(modules).then(
          () => {
            this.showSubmitInfo('Projekt wurde erfolgreich bearbeitet');
            this.projectSaved.emit(this.project);
          },
          error => {
            this.showSubmitInfo('Fehler beim Verknüpfen der Module');
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

    let modules = this.getAggregatedSelectedModules();
    this.createTags(this.tags).subscribe(tags => {
      if (this.project) {
        this.updateProject(project, modules, tags as Tag[]);
      } else {
        this.createProject(project, modules, tags as Tag[]);
      }
    });
  }

  private showSubmitInfo(message: string) {
    this.snack.open(message, null, {
      duration: 2000
    });
  }

  cancelButtonClicked() {
    this.cancel.emit();
    this.clearStorage();
  }
}
