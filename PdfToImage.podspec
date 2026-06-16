require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "PdfToImage"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/usmansalim3/react-native-pdf-to-image.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"

  install_modules_dependencies(s)

  # The module mixes Swift (PdfToImageImpl) with the ObjC++ TurboModule shim.
  # DEFINES_MODULE makes CocoaPods emit the `PdfToImage-Swift.h` header the
  # shim imports; merge so we don't drop what install_modules_dependencies set.
  existing_xcconfig = s.attributes_hash["pod_target_xcconfig"] || {}
  s.pod_target_xcconfig = existing_xcconfig.merge({
    "DEFINES_MODULE" => "YES",
    "SWIFT_VERSION" => "5.0"
  })
end
