//! Little-endian fixed-size codec.
//!
//! This is deliberately simple: every field is fixed-size, so encoding is a
//! concatenation and decoding is a sequential read. It is compatible with
//! Molecule `struct`/`array` layouts for the types defined in
//! `schemas/market.mol`.

use alloc::vec::Vec;

/// Codec errors.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodecError {
    /// Not enough bytes to read a field.
    UnexpectedEof,
    /// Bytes remain after decoding a fixed-size value.
    TrailingBytes,
    /// A byte used as a boolean was not 0 or 1.
    InvalidBool,
    /// An enum tag is not recognized.
    InvalidEnum,
    /// A length or arithmetic operation overflowed.
    Overflow,
}

/// Reads fixed-size values from a byte slice.
pub struct Reader<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }

    pub fn offset(&self) -> usize {
        self.offset
    }

    pub fn remaining(&self) -> usize {
        self.data.len().saturating_sub(self.offset)
    }

    fn take(&mut self, len: usize) -> Result<&'a [u8], CodecError> {
        let end = self.offset.checked_add(len).ok_or(CodecError::Overflow)?;
        if end > self.data.len() {
            return Err(CodecError::UnexpectedEof);
        }
        let slice = &self.data[self.offset..end];
        self.offset = end;
        Ok(slice)
    }

    pub fn u8(&mut self) -> Result<u8, CodecError> {
        Ok(self.take(1)?[0])
    }

    pub fn u32(&mut self) -> Result<u32, CodecError> {
        let bytes = self.take(4)?;
        let mut buf = [0u8; 4];
        buf.copy_from_slice(bytes);
        Ok(u32::from_le_bytes(buf))
    }

    pub fn u64(&mut self) -> Result<u64, CodecError> {
        let bytes = self.take(8)?;
        let mut buf = [0u8; 8];
        buf.copy_from_slice(bytes);
        Ok(u64::from_le_bytes(buf))
    }

    pub fn u128(&mut self) -> Result<u128, CodecError> {
        let bytes = self.take(16)?;
        let mut buf = [0u8; 16];
        buf.copy_from_slice(bytes);
        Ok(u128::from_le_bytes(buf))
    }

    pub fn i8(&mut self) -> Result<i8, CodecError> {
        Ok(self.u8()? as i8)
    }

    /// Ensures the reader consumed every byte.
    pub fn finish(self) -> Result<(), CodecError> {
        if self.offset == self.data.len() {
            Ok(())
        } else {
            Err(CodecError::TrailingBytes)
        }
    }
}

/// Writes fixed-size values to a byte vector.
pub struct Writer {
    buf: Vec<u8>,
}

impl Default for Writer {
    fn default() -> Self {
        Self::new()
    }
}

impl Writer {
    pub fn new() -> Self {
        Self { buf: Vec::new() }
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            buf: Vec::with_capacity(capacity),
        }
    }

    pub fn u8(&mut self, value: u8) {
        self.buf.push(value);
    }

    pub fn u32(&mut self, value: u32) {
        self.buf.extend_from_slice(&value.to_le_bytes());
    }

    pub fn u64(&mut self, value: u64) {
        self.buf.extend_from_slice(&value.to_le_bytes());
    }

    pub fn u128(&mut self, value: u128) {
        self.buf.extend_from_slice(&value.to_le_bytes());
    }

    pub fn i8(&mut self, value: i8) {
        self.buf.push(value as u8);
    }

    pub fn bytes(&mut self, value: &[u8]) {
        self.buf.extend_from_slice(value);
    }

    pub fn as_slice(&self) -> &[u8] {
        &self.buf
    }

    pub fn into_vec(self) -> Vec<u8> {
        self.buf
    }
}

/// A value that can be written to a `Writer`.
pub trait Encode {
    fn encode(&self, writer: &mut Writer);
}

/// A value that can be read from a `Reader`.
pub trait Decode: Sized {
    fn decode(reader: &mut Reader<'_>) -> Result<Self, CodecError>;
}

impl Encode for u8 {
    fn encode(&self, writer: &mut Writer) {
        writer.u8(*self);
    }
}

impl Decode for u8 {
    fn decode(reader: &mut Reader<'_>) -> Result<Self, CodecError> {
        reader.u8()
    }
}

impl Encode for u32 {
    fn encode(&self, writer: &mut Writer) {
        writer.u32(*self);
    }
}

impl Decode for u32 {
    fn decode(reader: &mut Reader<'_>) -> Result<Self, CodecError> {
        reader.u32()
    }
}

impl Encode for u64 {
    fn encode(&self, writer: &mut Writer) {
        writer.u64(*self);
    }
}

impl Decode for u64 {
    fn decode(reader: &mut Reader<'_>) -> Result<Self, CodecError> {
        reader.u64()
    }
}

impl Encode for u128 {
    fn encode(&self, writer: &mut Writer) {
        writer.u128(*self);
    }
}

impl Decode for u128 {
    fn decode(reader: &mut Reader<'_>) -> Result<Self, CodecError> {
        reader.u128()
    }
}

impl Encode for i8 {
    fn encode(&self, writer: &mut Writer) {
        writer.i8(*self);
    }
}

impl Decode for i8 {
    fn decode(reader: &mut Reader<'_>) -> Result<Self, CodecError> {
        reader.i8()
    }
}

impl<const N: usize> Encode for [u8; N] {
    fn encode(&self, writer: &mut Writer) {
        writer.bytes(self);
    }
}

impl<const N: usize> Decode for [u8; N] {
    fn decode(reader: &mut Reader<'_>) -> Result<Self, CodecError> {
        let mut out = [0u8; N];
        for byte in &mut out {
            *byte = reader.u8()?;
        }
        Ok(out)
    }
}

impl<const N: usize> Encode for [u128; N] {
    fn encode(&self, writer: &mut Writer) {
        for value in self {
            writer.u128(*value);
        }
    }
}

impl<const N: usize> Decode for [u128; N] {
    fn decode(reader: &mut Reader<'_>) -> Result<Self, CodecError> {
        let mut out = [0u128; N];
        for value in &mut out {
            *value = reader.u128()?;
        }
        Ok(out)
    }
}
