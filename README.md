# RigMesh

First, install the dependencies

```bash
npm install
```

Then, run the following command and open [http://localhost:5173](http://localhost:5173) with your browser to see the result
```
npx vite
```

## TODO (in priority order)
- [X] Explore reason of mesh merge stitching broken some times (CDT get wrong result)?
- [X] Fix the mesh not baked when transformed from ```skinnedMesh``` back to data. Rigged mesh is currently not supposed to be put through any operations like cut or merge.
- [ ] Fix the cut line and cut plane inconsistency
- [ ] Fix other React-related bugs (state handling, stack overflow, ...)
- [X] Add Scene Graph to the viewport
- [X] Deployment
- [ ] Import/Export functionality
- [ ] Scene Manipulation Toolbar:
    - [ ] A horizontal bottom toolbar to select mesh transformation tool:
        - A simple selection tool (no transform control helper is displayed, default tool)
        - Translation tool (with 'G' bindkey): 'move' icon in lucide
        - Rotation tool (with 'R' bindkey): 'refresh-ccw' icon
        - Scale tool (with 'S' bindkey): 'expand' icon
    - [ ] A lock button: Avoid camera control while trying to manipulate small object in the scene
- [ ] Scene Graph manipulation:
    - [ ] Allow changing name of object in the scene by interacting with entry of scene graph
    - [ ] Allow setting a joint to be root of bone hierarchy
    - [ ] Highlight entry in the scene graph when object is selected from scene
- [ ] Inverse kinematic rigging mechanism
- [ ] Overlay container for operational scene
- [ ] Change default angle of new scene
- [ ] Viewmode toggle:
    - [ ] Wireframe
    - [ ] Normal
    - [ ] Skeleton
    - [ ] Operation step-by-step execution
    
