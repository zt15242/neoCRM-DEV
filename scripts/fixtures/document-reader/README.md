# Legacy Word fixture

`sample.doc` is an original test document, generated with macOS `textutil` from this UTF-8 text:

```text
Legacy Word fixture
旧版 Word 中文核对样本
Amount: 200
```

Generation: `textutil -convert doc -output sample.doc sample.txt`.
No customer data is included. The fixture verifies DOC extraction on every platform without requiring Office or textutil at test time.

`chinese.pdf` is an original two-page text PDF generated with ReportLab, using the built-in `STSong-Light` CID font. It contains only “销售易文档读取核对：客户金额 200 元” and “第二页中文内容：审批流程”. It verifies packaged PDF CMap support without depending on installed system fonts.

`password.pdf` is an original ReportLab test document protected with the test-only password `fixture-password`. It verifies that password-protected inputs fail explicitly instead of returning a misleading empty document.
