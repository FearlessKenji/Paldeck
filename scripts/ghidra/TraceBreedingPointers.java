// Recover Unreal reflection tables by scanning for absolute pointers to breeding strings.
// @category Paldeck

import java.io.File;
import java.io.PrintWriter;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

public class TraceBreedingPointers extends GhidraScript {
	private static final String[] TERMS = {
		"Combi_MutationRate", "Combi_MutationRankCoefficient", "Combi_MutationRankDiffPenalty",
		"Combi_MutationRandomCoefficient", "Combi_MutationMinTalent", "Combi_MutationInitialRank",
		"bIsMutationPalEgg", "MutationRateBonusPercent", "CombiRank",
	};

	@Override
	public void run() throws Exception {
		if (getScriptArgs().length != 1) {
			throw new IllegalArgumentException("Expected output file path.");
		}
		try (PrintWriter writer = new PrintWriter(new File(getScriptArgs()[0]), StandardCharsets.UTF_8)) {
			Memory memory = currentProgram.getMemory();
			for (String term : TERMS) {
				Address termAddress = memory.findBytes(currentProgram.getMinAddress(), term.getBytes(StandardCharsets.US_ASCII), null, true, monitor);
				while (termAddress != null) {
					writer.printf("%n## %s @ %s%n", term, termAddress);
					Set<Address> firstLevel = findPointers(termAddress, writer, "pointer");
					for (Address pointer : firstLevel) {
						findPointers(pointer, writer, "pointer-to-pointer");
					}
					termAddress = memory.findBytes(termAddress.add(term.length()), term.getBytes(StandardCharsets.US_ASCII), null, true, monitor);
				}
			}
		}
	}

	private Set<Address> findPointers(Address target, PrintWriter writer, String label) throws Exception {
		Set<Address> foundPointers = new LinkedHashSet<>();
		byte[] pattern = ByteBuffer.allocate(Long.BYTES).order(ByteOrder.LITTLE_ENDIAN).putLong(target.getOffset()).array();
		Address cursor = currentProgram.getMinAddress();
		Memory memory = currentProgram.getMemory();
		while (cursor != null) {
			Address found = memory.findBytes(cursor, pattern, null, true, monitor);
			if (found == null) {
				break;
			}
			foundPointers.add(found);
			writer.printf("  %s %s%n", label, found);
			Function containing = currentProgram.getFunctionManager().getFunctionContaining(found);
			if (containing != null) {
				writer.printf("    contained-in %s @ %s%n", containing.getName(), containing.getEntryPoint());
			}
			ReferenceIterator references = currentProgram.getReferenceManager().getReferencesTo(found);
			while (references.hasNext()) {
				Reference reference = references.next();
				Function function = currentProgram.getFunctionManager().getFunctionContaining(reference.getFromAddress());
				writer.printf("    xref %s function=%s%n", reference.getFromAddress(), function == null ? "(none)" : function.getName());
			}
			writer.print("    qwords");
			for (int offset = -32; offset <= 64; offset += 8) {
				try {
					writer.printf(" [%+d]=%016x", offset, memory.getLong(found.add(offset)));
				} catch (Exception ignored) {
					writer.printf(" [%+d]=?", offset);
				}
			}
			writer.println();
			cursor = found.add(Long.BYTES);
		}
		return foundPointers;
	}
}
