// testJinkang.ts - Node.js For循环示例

// 示例1: 基本的for循环
console.log("示例1: 基本的for循环");
for (let i = 0; i < 5; i++) {
    console.log(`循环次数: ${i}`);
}

// 示例2: 遍历数组
console.log("\n示例2: 遍历数组");
const fruits = ['苹果', '香蕉', '橙子', '葡萄', '芒果'];
for (let i = 0; i < fruits.length; i++) {
    console.log(`水果 ${i + 1}: ${fruits[i]}`);
}

// 示例3: 倒序循环
console.log("\n示例3: 倒序循环");
for (let i = 5; i > 0; i--) {
    console.log(`倒计时: ${i}`);
}

// 示例4: 循环计算
console.log("\n示例4: 循环计算");
let sum = 0;
for (let i = 1; i <= 10; i++) {
    sum += i;
    console.log(`当前i=${i}, 累计和=${sum}`);
}
console.log(`1到10的和是: ${sum}`);

// 示例5: 嵌套循环
console.log("\n示例5: 嵌套循环 - 乘法表");
for (let i = 1; i <= 3; i++) {
    for (let j = 1; j <= 3; j++) {
        console.log(`${i} × ${j} = ${i * j}`);
    }
}

// 示例6: 使用for...of循环遍历数组
console.log("\n示例6: 使用for...of循环");
for (const fruit of fruits) {
    console.log(`水果: ${fruit}`);
}

// 示例7: 使用for...in循环遍历对象
console.log("\n示例7: 使用for...in循环遍历对象");
const person = {
    name: '张三',
    age: 25,
    city: '北京',
    job: '工程师'
};

for (const key in person) {
    console.log(`${key}: ${person[key as keyof typeof person]}`);
}

// 示例8: 带条件的循环
console.log("\n示例8: 带条件的循环");
const numbers = [1, 3, 5, 7, 9, 2, 4, 6, 8, 10];
let evenCount = 0;

for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] % 2 === 0) {
        evenCount++;
        console.log(`找到偶数: ${numbers[i]}`);
    }
}
console.log(`总共找到 ${evenCount} 个偶数`);

// 示例9: 使用break和continue
console.log("\n示例9: 使用break和continue");
for (let i = 1; i <= 10; i++) {
    if (i === 3) {
        console.log("跳过3");
        continue;
    }
    if (i === 8) {
        console.log("在8处停止循环");
        break;
    }
    console.log(`当前值: ${i}`);
}

// 示例10: 异步循环示例
console.log("\n示例10: 异步循环示例");
async function asyncLoopExample() {
    const urls = ['url1', 'url2', 'url3'];
    
    for (let i = 0; i < urls.length; i++) {
        console.log(`处理URL ${i + 1}: ${urls[i]}`);
        // 模拟异步操作
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log("所有异步操作完成");
}

// 运行异步示例
asyncLoopExample().then(() => {
    console.log("\n所有示例执行完成！");
});