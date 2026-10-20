export default {
  meta: { name: "pluginsdk" },
  rules: {
    "use-match": {
      meta: { type: "problem", schema: [] },
      create(context) {
        return {
          SwitchStatement(node) {
            context.report({ node, message: "Use Effect Match with exhaustive handlers instead of switch." })
          }
        }
      }
    }
  }
}
