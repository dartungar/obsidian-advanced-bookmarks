# Advanced Bookmarks

Advanced Bookmarks adds dynamic folders and folder notes to Obsidian's built-in Bookmarks. 
Your existing bookmarks appear in the same sidebar.

## Features

Dynamic folders are bookmark folders that automatically list notes matching your rules. 
For example, a **Projects** folder can show every note tagged `#project` whose `status` property is `active`. 

- Gather notes by tag, vault folder, name, or property. Combine rules with all/any matching and exclusions.
- Show notes from a specific view in a `.base` file.
- Nest folders. Nested dynamic folders show only notes that also match their parent.
- Sort notes by title, filename, path, creation or modification date, or Base view order. Choose manual sorting to arrange them by dragging.
- Attach a folder note to a custom folder or a core bookmark group.
- Use core bookmark context menus and drag bookmarks between core groups.

The sidebar uses Obsidian's tree styling, with optional file icons and a search filter. Toolbar controls let you bookmark the current tab and collapse or expand all folders.

## Usage

Open the sidebar from the bookmark-check ribbon icon or the **Advanced Bookmarks: Open bookmarks** command.

Select **New dynamic folder**, choose a parent, and set up **Rules** or a **Base view**. Choose how to sort the notes, then save.

Right-click a folder to edit it, add children, or create or link a folder note. Unlinking a note keeps the file.

Ordinary bookmarks and folders can be reordered by dragging. For notes in a dynamic folder, select **Sort notes → Manual** first. Clear the sidebar filter before dragging.

Change file icon visibility and the folder note location in **Settings → Advanced Bookmarks**.

## Compatibility

Enable **Bookmarks** in **Settings → Core plugins** to use native bookmark actions. With it disabled, saved bookmarks are read-only. Custom folders and folder note links appear only in Advanced Bookmarks. Core bookmarks stay synchronized and can move between core groups, but cannot move into custom folders.

Dynamic folders show Markdown notes only. Dragging a result changes its order without moving the vault file.

Base views need **Bases** enabled and native query support. Missing or unsupported views show a status message. The view's limit applies before parent filtering. If you rename a view, select it again in the folder editor.

Bookmarks and Base integration use private Obsidian APIs, so Obsidian updates may require plugin changes. Testing in installed desktop and mobile Obsidian, including touch dragging, is still pending.
