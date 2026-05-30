import type { NotesPanelComponent, NotesPanelElements } from './notes-panel.component.js';

export function wireNotesPanel(component: NotesPanelComponent, elements: NotesPanelElements): void {
  component.searchComponent!.initialize({
    searchInput: elements.notesSearchInput,
    onSearch: (query: string) => component._handleSearch(query)
  });
  component.gameFilter!.initialize({
    filterButton: elements.notesGameFilter,
    filterLabel: elements.notesGameFilterLabel,
    filterMenu: elements.notesGameFilterMenu,
    onFilterChange: (value: string) => component._handleGameFilterChange(value)
  });
  component.listView!.initialize({
    listElement: elements.notesList,
    onNoteSelect: (noteId: string) => component._handleNoteSelect(noteId)
  });
  component.editorView!.initialize({
    editorElement: elements.notesEditor,
    titleInput: elements.notesTitleInput,
    contentArea: elements.notesContentArea,
    deleteBtn: elements.notesDeleteBtn,
    gameTagRow: elements.notesGameTagRow,
    gameTag: elements.notesGameTag,
    gameInput: elements.notesGameInput,
    gameAddBtn: elements.notesGameAddBtn,
    onSave: () => component._saveCurrentNote(),
    onDelete: () => component._deleteCurrentNote(),
    onGameInputChange: () => component._handleGameInputChange(),
    onShowGameInput: () => component._showGameInput()
  });
  component.gameAutocomplete!.initialize({
    gameInput: elements.notesGameInput,
    autocompleteDropdown: elements.notesGameAutocomplete,
    onInput: () => component._handleGameInputChange(),
    onSelect: (value: string) => component._handleAutocompleteSelect(value),
    onEnter: () => component._handleAutocompleteEnter(),
    onEscape: () => component._handleAutocompleteEscape(),
    onBlur: () => component.editorView!.hideGameInput(),
    onFocus: () => {}
  });
  component.resizeHandler!.initialize({
    listToggle: elements.notesListToggle,
    panelElement: elements.notesPanel,
    panelContent: elements.notesPanelContent,
    listWrapper: elements.notesListWrapper,
    onToggle: () => {}
  });
}
