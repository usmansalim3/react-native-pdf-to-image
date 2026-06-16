#import "PdfToImage.h"
#import <React/RCTBridgeModule.h>

// The Swift→ObjC generated header. Bracketed form is used under
// `use_frameworks!`, the quoted form for the default static-library build.
#if __has_include("PdfToImage-Swift.h")
#import "PdfToImage-Swift.h"
#else
#import <PdfToImage/PdfToImage-Swift.h>
#endif

@implementation PdfToImage {
  PdfToImageImpl *_impl;
}

- (instancetype)init
{
  if (self = [super init]) {
    _impl = [PdfToImageImpl new];
  }
  return self;
}

// Forward the codegen protocol methods to the Swift implementation, adapting
// the React promise blocks to the plain closures Swift expects.
- (void)getPdfInfo:(NSString *)source
           options:(NSDictionary *)options
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  [_impl getPdfInfo:source
            options:options
            resolve:^(id _Nullable result) { resolve(result); }
             reject:^(NSString *code, NSString *message) { reject(code, message, nil); }];
}

- (void)convert:(NSString *)source
        options:(NSDictionary *)options
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject
{
  [_impl convert:source
         options:options
         resolve:^(id _Nullable result) { resolve(result); }
          reject:^(NSString *code, NSString *message) { reject(code, message, nil); }];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativePdfToImageSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"PdfToImage";
}

@end
