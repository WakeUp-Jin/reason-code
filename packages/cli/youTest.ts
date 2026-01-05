// 简洁的if判断示例
const value = 10;

if (value > 5) {
  console.log("值大于5");
} else if (value === 5) {
  console.log("值等于5");
} else {
  console.log("值小于5");
}

// 三元运算符
const result = value > 5 ? "大于" : "小于等于";
console.log(`值${result}5`);