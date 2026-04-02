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
- [ ] Explore reason of mesh merge stitching broken some times (CDT get wrong result)?
- [ ] Fix the mesh not baked when transformed from ```skinnedMesh``` back to data. Rigged mesh is currently not supposed to be put through any operations like cut or merge.
- [ ] Fix the cut line and cut plane inconsistency
- [ ] Fix other React-related bugs (state handling, stack overflow, ...)
- [ ] Add Scene Graph to the viewport
- [ ] Deployment
