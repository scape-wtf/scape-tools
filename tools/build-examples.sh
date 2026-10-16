set -eu
for example in examples/gizmos/*; do
  [ -f "$example/package.json" ] || continue
  npm run build --prefix "$example"
done
