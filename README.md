# RigMesh

First, install the dependencies

```bash
npm install
```

Then, run the following command and open [http://localhost:3000](http://localhost:3000) with your browser to see the result
```
npm run dev
```

## TODO (in priority order)
- [ ] Change Linear-Algebra dependencies
- [ ] Explore reason of mesh merge stitching broken some times (CDT get wrong result)?
- [ ] Fix the mesh not baked when transformed from ```skinnedMesh``` back to data. Rigged mesh is currently not supposed to be put through any operations like cut or merge.
- [ ] Fix the cut line and cut plane inconsistency
- [ ] Fix other React-related bugs (state handling, stack overflow, ...)
- [ ] Add Scene Graph to the viewport
- [ ] Deployment
