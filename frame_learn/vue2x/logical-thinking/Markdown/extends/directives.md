# Directives

## v-model (绑定在el上)

```html
<div id="app">
<h3>v-model 绑定在DOM上</h3>
<el-model></el-model>
</div>

<script>
window.onload = function() {
  /** v-model 绑定在DOM上 **/
  let elModel = {
    template: `
    <div>
      <p>输入的内容: {{ message }} </p>
      <input v-model="message" placeholder="" >
    </div>
    `,
    data() {
      return {
        message: '信息'
      }
    },
  }

  let vm = new Vue({
    el: '#app',
    components: { elModel }
  })
}
</script>
```

genDirectivesk

baseOpts获取directives

4个model文件

1. compiler阶段
   1. parse --> 提取directive
   2. generate --> 生成code(语法塘事件)
2. path -->
   1. invokeCreateHooks --> 
      1. updateDOMListener
      2. updateDOMProps
      3. updateDirective
3. 

